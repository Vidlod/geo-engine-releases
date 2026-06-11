/**
 * GEO Engine — Capa de agentes (multi-driver).
 *
 * Ejecuta las skills geo-* en modo headless sobre la carpeta del proyecto.
 * Hay dos drivers intercambiables; el usuario elige cuál usar:
 *
 *   • claude       (kind 'sdk') — @anthropic-ai/claude-agent-sdk embebido en la
 *                  app (mismo runtime que el CLI de Claude Code, sin instalación
 *                  aparte). Carga diferida por import() (es ESM puro).
 *   • antigravity  (kind 'cli') — CLI externo de Antigravity, detectado en el
 *                  PATH. El comando de invocación es configurable y se persiste,
 *                  así no hace falta tocar código para ajustarlo.
 *
 * Cada driver expone el mismo contrato hacia la app: detección de estado,
 * credenciales y `generate()` con eventos de progreso. La selección y los
 * comandos se guardan en `agent-config.json`; las credenciales, cifradas, en
 * `agent-<id>.bin` (safeStorage).
 *
 * @module server/agent
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const { spawn, spawnSync } = require('child_process');

/** Skills que la app instala en cada proyecto. */
const SKILL_DIRS = [
  'geo-momento',
  'geo-entregable',
  'geo-introduccion',
  'geo-glosario',
  'geo-linea-tiempo',
];

/** Agentes disponibles (orden = orden de aparición en la UI). */
const AGENTS = [
  { id: 'claude', label: 'Claude Code', kind: 'sdk' },
  { id: 'antigravity', label: 'Antigravity', kind: 'cli' },
];

/** Comando por defecto del CLI de Antigravity (editable desde la app). */
const DEFAULT_ANTIGRAVITY_COMMAND = 'antigravity';

/** Config persistida del agente. */
const CONFIG_FILE = 'agent-config.json';

/* ── Persistencia de configuración ────────────────────────────────── */

/** @param {string} userDataPath */
function configPath(userDataPath) {
  return path.join(userDataPath, CONFIG_FILE);
}

/**
 * @param {string} userDataPath
 * @returns {{ selected: string, antigravity: { command: string } }}
 */
function readConfig(userDataPath) {
  const base = { selected: 'claude', antigravity: { command: DEFAULT_ANTIGRAVITY_COMMAND } };
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(userDataPath), 'utf-8'));
    return {
      selected: AGENTS.some((a) => a.id === raw.selected) ? raw.selected : 'claude',
      antigravity: { command: (raw.antigravity && raw.antigravity.command) || DEFAULT_ANTIGRAVITY_COMMAND },
    };
  } catch {
    return base;
  }
}

/** @param {string} userDataPath @param {object} cfg */
function writeConfig(userDataPath, cfg) {
  fs.writeFileSync(configPath(userDataPath), JSON.stringify(cfg, null, 2));
}

/* ── Credenciales (por agente) ────────────────────────────────────── */

/** @param {string} userDataPath @param {string} agentId */
function credPath(userDataPath, agentId) {
  return path.join(userDataPath, `agent-${agentId}.bin`);
}

/**
 * Guarda una credencial (token/API key) cifrada para un agente.
 * @param {string} userDataPath @param {any} safeStorage @param {string} agentId @param {string} token
 */
async function setToken(userDataPath, safeStorage, agentId, token) {
  const clean = String(token).trim();
  if (!clean) throw new Error('El token está vacío.');
  const data = safeStorage && safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(clean)
    : Buffer.from(clean, 'utf-8');
  fs.writeFileSync(credPath(userDataPath, agentId), data);
  return getStatus(userDataPath, safeStorage);
}

/** @param {string} userDataPath @param {any} safeStorage @param {string} agentId */
async function clearToken(userDataPath, safeStorage, agentId) {
  try { fs.unlinkSync(credPath(userDataPath, agentId)); } catch { /* no existía */ }
  return getStatus(userDataPath, safeStorage);
}

/**
 * @param {string} userDataPath @param {any} safeStorage @param {string} agentId
 * @returns {string|null}
 */
function readStoredToken(userDataPath, safeStorage, agentId) {
  try {
    const raw = fs.readFileSync(credPath(userDataPath, agentId));
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try { return safeStorage.decryptString(raw); } catch { /* texto plano viejo */ }
    }
    return raw.toString('utf-8').trim() || null;
  } catch {
    return null;
  }
}

/* ── Selección y comando ──────────────────────────────────────────── */

/** @param {string} userDataPath @param {string} agentId @param {any} safeStorage */
async function selectAgent(userDataPath, safeStorage, agentId) {
  if (!AGENTS.some((a) => a.id === agentId)) throw new Error(`Agente desconocido: ${agentId}`);
  const cfg = readConfig(userDataPath);
  cfg.selected = agentId;
  writeConfig(userDataPath, cfg);
  return getStatus(userDataPath, safeStorage);
}

/** Cambia el comando de un agente CLI. @param {string} userDataPath @param {string} agentId @param {string} command @param {any} safeStorage */
async function setCommand(userDataPath, safeStorage, agentId, command) {
  const cfg = readConfig(userDataPath);
  if (agentId === 'antigravity') {
    cfg.antigravity.command = String(command).trim() || DEFAULT_ANTIGRAVITY_COMMAND;
  }
  writeConfig(userDataPath, cfg);
  return getStatus(userDataPath, safeStorage);
}

/* ── Detección de cada driver ─────────────────────────────────────── */

/**
 * El Agent SDK es ESM puro; bajo Electron (Node 20) hay que cargarlo con
 * import() dinámico (require() lanza MODULE_NOT_FOUND). Carga diferida.
 * @type {Promise<any|null>|undefined}
 */
let sdkPromise;

/** @returns {Promise<any|null>} */
function loadSdk() {
  if (sdkPromise !== undefined) return sdkPromise;
  sdkPromise = (async () => {
    try {
      const req = createRequire(__filename);
      const entry = req.resolve('@anthropic-ai/claude-agent-sdk');
      return await import(pathToFileURL(entry).href);
    } catch (err) {
      console.error('[agent] No se pudo cargar el Agent SDK:', err && err.message);
      return null;
    }
  })();
  return sdkPromise;
}

/** ¿Hay sesión del CLI de Claude Code en esta máquina? */
function hasCliSession() {
  const home = os.homedir();
  return ['.credentials.json', 'settings.json'].some((f) =>
    fs.existsSync(path.join(home, '.claude', f))
  );
}

/**
 * Localiza un comando: ruta absoluta existente o búsqueda en el PATH.
 * @param {string} command
 * @returns {string|null} ruta resuelta o null
 */
function findOnPath(command) {
  if (!command) return null;
  const first = command.trim().split(/\s+/)[0];
  if (path.isAbsolute(first) && fs.existsSync(first)) return first;
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(probe, [first], { encoding: 'utf-8' });
    if (r.status === 0) {
      const line = String(r.stdout).split(/\r?\n/).find((l) => l.trim());
      return line ? line.trim() : null;
    }
  } catch { /* sin PATH utilizable */ }
  return null;
}

/**
 * Estado de todos los agentes + cuál está seleccionado.
 * @param {string} userDataPath @param {any} safeStorage
 * @returns {Promise<{ selected: string, agents: object[] }>}
 */
async function getStatus(userDataPath, safeStorage) {
  const cfg = readConfig(userDataPath);

  // Claude (SDK)
  const sdkAvailable = (await loadSdk()) !== null;
  const claudeStored = readStoredToken(userDataPath, safeStorage, 'claude');
  let claudeSource = null;
  if (claudeStored) claudeSource = 'app';
  else if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) claudeSource = 'env';
  else if (hasCliSession()) claudeSource = 'cli';

  // Antigravity (CLI)
  const agCommand = cfg.antigravity.command;
  const agResolved = findOnPath(agCommand);

  const agents = [
    {
      id: 'claude',
      label: 'Claude Code',
      kind: 'sdk',
      available: sdkAvailable,
      hasCredential: claudeSource !== null,
      credentialSource: claudeSource,
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      kind: 'cli',
      available: agResolved !== null,
      // El CLI gestiona su propia sesión (login con cuenta Google); si está
      // en el PATH lo damos por usable. Si no estuviera logueado, el error
      // de generación lo dirá.
      hasCredential: agResolved !== null,
      credentialSource: agResolved ? 'cli' : null,
      command: agCommand,
      resolvedPath: agResolved,
    },
  ];

  return { selected: cfg.selected, agents };
}

/* ── Skills en el proyecto ────────────────────────────────────────── */

/**
 * Copia (o actualiza) las skills geo-* dentro de `<proyecto>/.claude/skills/`.
 * @param {string} projectPath @param {string} skillsSrcPath
 * @returns {string[]} skills sincronizadas
 */
function syncSkills(projectPath, skillsSrcPath) {
  const dstRoot = path.join(projectPath, '.claude', 'skills');
  /** @type {string[]} */
  const synced = [];
  for (const name of SKILL_DIRS) {
    const src = path.join(skillsSrcPath, name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
    const dst = path.join(dstRoot, name);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true });
    synced.push(name);
  }
  return synced;
}

/* ── Prompt de generación (agnóstico al agente) ───────────────────── */

/**
 * Instrucción headless para una estructura concreta. Referencia la skill por
 * su archivo (`.claude/skills/<skill>/SKILL.md`) para que cualquier agente la
 * pueda seguir, no solo el que tiene cargador nativo de skills.
 * @param {{ id: string, skill: string, file: string, label: string, numero?: number }} structure
 * @returns {string}
 */
function buildInstruction(structure) {
  const numero = structure.numero ? ` ${structure.numero}` : '';
  return [
    `Tarea: generar "${structure.label}" del curso.`,
    `Sigue al pie de la letra la skill en .claude/skills/${structure.skill}/SKILL.md`,
    'y sus archivos de referencia (reglas-transversales y genéricos).',
    'Insumos del curso: carpeta insumos/ (la AAA es la fuente autoritativa).',
    'Configuración e IDs de Moodle: curso.yaml en la raíz del proyecto',
    '(incluye el MAPA DE ARCHIVOS en la clave files: — usa esos nombres exactos,',
    'no inventes nombres de archivo).',
    `Número de la estructura:${numero || ' n/a'}.`,
    `Escribe el HTML final en generadas/${structure.file} (sobrescribe si existe).`,
    'Si faltan datos, usa el protocolo de FLAGS de la skill y continúa.',
    'Al final, deja la lista de FLAGS y la lista CORRECCIONES: como comentario',
    `HTML al inicio de generadas/${structure.file}.`,
  ].join('\n');
}

/* ── Driver Claude (SDK) ──────────────────────────────────────────── */

/**
 * @param {object} ctx
 * @param {any} ctx.sdk @param {string} ctx.projectPath @param {object} ctx.env
 * @param {string} ctx.instruction @param {(e:object)=>void} ctx.emit
 * @param {{file:string,label:string}} ctx.structure
 * @returns {Promise<{ok:boolean,file?:string,error?:string}>}
 */
async function claudeGenerate({ sdk, projectPath, env, instruction, emit, structure }) {
  try {
    const stream = sdk.query({
      prompt: instruction,
      options: {
        cwd: projectPath,
        env,
        permissionMode: 'acceptEdits',
        settingSources: ['project'],
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'TodoWrite'],
        maxTurns: 60,
      },
    });

    for await (const message of stream) {
      if (message.type === 'assistant') {
        const blocks = message.message && message.message.content;
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block.type === 'text' && block.text && block.text.trim()) {
              emit({ type: 'text', message: block.text.trim().slice(0, 400) });
            } else if (block.type === 'tool_use') {
              emit({ type: 'tool', message: describeTool(block) });
            }
          }
        }
      } else if (message.type === 'result') {
        if (message.subtype === 'success') {
          emit({ type: 'done', message: 'Generación terminada.', file: structure.file });
          return { ok: true, file: structure.file };
        }
        const error = `El agente terminó sin éxito (${message.subtype}).`;
        emit({ type: 'error', message: error });
        return { ok: false, error };
      }
    }
    const error = 'El agente terminó sin entregar resultado.';
    emit({ type: 'error', message: error });
    return { ok: false, error };
  } catch (err) {
    const error = err && err.message ? err.message : 'Error desconocido del agente.';
    emit({ type: 'error', message: error });
    return { ok: false, error };
  }
}

/* ── Driver CLI genérico (Antigravity) ────────────────────────────── */

/**
 * Convierte el comando configurado en [bin, ...args]. Si contiene el token
 * `{prompt}` se reemplaza por la instrucción como argumento; si no, la
 * instrucción se envía por stdin.
 * @param {string} command @param {string} instruction
 * @returns {{ tokens: string[], promptViaStdin: boolean }}
 */
function parseCommand(command, instruction) {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  let promptViaStdin = true;
  const tokens = parts.map((t) => {
    if (t === '{prompt}') { promptViaStdin = false; return instruction; }
    return t;
  });
  return { tokens, promptViaStdin };
}

/**
 * Ejecuta el CLI externo (Antigravity) y transmite su salida.
 * @param {object} ctx
 * @param {string} ctx.command @param {string} ctx.projectPath @param {object} ctx.env
 * @param {string} ctx.instruction @param {(e:object)=>void} ctx.emit
 * @param {{file:string,label:string}} ctx.structure
 * @returns {Promise<{ok:boolean,file?:string,error?:string}>}
 */
function cliGenerate({ command, projectPath, env, instruction, emit, structure }) {
  return new Promise((resolve) => {
    const bin = findOnPath(command);
    if (!bin) {
      const error = `No se encontró el comando "${command.split(/\s+/)[0]}" en el PATH. Configúralo en el panel del agente.`;
      emit({ type: 'error', message: error });
      resolve({ ok: false, error });
      return;
    }

    const { tokens, promptViaStdin } = parseCommand(command, instruction);
    const args = tokens.slice(1); // tokens[0] es el binario (ya resuelto en bin)

    let child;
    try {
      child = spawn(bin, args, { cwd: projectPath, env });
    } catch (err) {
      const error = `No se pudo lanzar el CLI: ${err && err.message}`;
      emit({ type: 'error', message: error });
      resolve({ ok: false, error });
      return;
    }

    if (promptViaStdin && child.stdin) {
      child.stdin.write(instruction);
      child.stdin.end();
    }

    /** Vuelca líneas de salida como eventos de progreso. @param {Buffer} buf */
    const pump = (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        const t = line.trim();
        if (t) emit({ type: 'text', message: t.slice(0, 400) });
      }
    };
    if (child.stdout) child.stdout.on('data', pump);
    if (child.stderr) child.stderr.on('data', pump);

    child.on('error', (err) => {
      const error = `Error del CLI: ${err && err.message}`;
      emit({ type: 'error', message: error });
      resolve({ ok: false, error });
    });

    child.on('close', (code) => {
      const outFile = path.join(projectPath, 'generadas', structure.file);
      if (code === 0 && fs.existsSync(outFile)) {
        emit({ type: 'done', message: 'Generación terminada.', file: structure.file });
        resolve({ ok: true, file: structure.file });
      } else if (code === 0) {
        const error = `El CLI terminó pero no se encontró generadas/${structure.file}. Revisa el comando configurado.`;
        emit({ type: 'error', message: error });
        resolve({ ok: false, error });
      } else {
        const error = `El CLI terminó con código ${code}.`;
        emit({ type: 'error', message: error });
        resolve({ ok: false, error });
      }
    });
  });
}

/* ── Generación (despacha al agente seleccionado) ─────────────────── */

/**
 * @param {object} opts
 * @param {string} opts.projectPath
 * @param {{ id:string, skill:string, file:string, label:string, numero?:number }} opts.structure
 * @param {string} opts.skillsSrcPath
 * @param {string} opts.userDataPath
 * @param {any} opts.safeStorage
 * @param {(event: {type:string, [k:string]:any}) => void} opts.onEvent
 * @returns {Promise<{ ok: boolean, file?: string, error?: string }>}
 */
async function generate({ projectPath, structure, skillsSrcPath, userDataPath, safeStorage, onEvent }) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  const status = await getStatus(userDataPath, safeStorage);
  const selected = status.agents.find((a) => a.id === status.selected);

  if (!selected || !selected.available) {
    const error = selected && selected.kind === 'cli'
      ? `El CLI de ${selected.label} no está disponible. Revisa el comando en el panel del agente.`
      : `El motor ${selected ? selected.label : 'IA'} no está disponible en esta instalación.`;
    emit({ type: 'error', message: error });
    return { ok: false, error };
  }
  if (!selected.hasCredential) {
    const error = `No hay una cuenta conectada para ${selected.label}. Conéctala desde el panel del agente.`;
    emit({ type: 'error', message: error });
    return { ok: false, error };
  }

  emit({ type: 'status', message: 'Preparando skills en el proyecto…' });
  const synced = syncSkills(projectPath, skillsSrcPath);
  emit({ type: 'status', message: `Skills listas: ${synced.join(', ') || 'ninguna (revisa la instalación)'}` });

  const env = { ...process.env };
  const instruction = buildInstruction(structure);
  emit({ type: 'status', message: `Generando ${structure.label} con ${selected.label}…` });

  if (selected.kind === 'sdk') {
    const sdk = await loadSdk();
    // Credencial → entorno del agente
    const stored = readStoredToken(userDataPath, safeStorage, 'claude');
    if (stored) {
      if (stored.startsWith('sk-ant-api')) env.ANTHROPIC_API_KEY = stored;
      else env.CLAUDE_CODE_OAUTH_TOKEN = stored;
    }
    return claudeGenerate({ sdk, projectPath, env, instruction, emit, structure });
  }

  // CLI (Antigravity)
  const stored = readStoredToken(userDataPath, safeStorage, selected.id);
  if (stored) env.GEO_AGENT_TOKEN = stored; // disponible por si el CLI lo usa
  return cliGenerate({ command: selected.command, projectPath, env, instruction, emit, structure });
}

/**
 * Descripción amigable de una llamada a herramienta del agente.
 * @param {{ name?: string, input?: any }} block
 */
function describeTool(block) {
  const input = block.input || {};
  const target = input.file_path || input.path || input.pattern || input.skill || '';
  const short = typeof target === 'string' ? path.basename(String(target)) : '';
  switch (block.name) {
    case 'Read': return `Leyendo ${short || 'archivo'}…`;
    case 'Write': return `Escribiendo ${short || 'archivo'}…`;
    case 'Edit': return `Editando ${short || 'archivo'}…`;
    case 'Glob':
    case 'Grep': return 'Buscando en los insumos…';
    case 'Skill': return `Aplicando skill ${short || ''}…`;
    default: return `${block.name || 'Herramienta'}…`;
  }
}

module.exports = {
  SKILL_DIRS,
  AGENTS,
  getStatus,
  selectAgent,
  setToken,
  clearToken,
  setCommand,
  syncSkills,
  buildInstruction,
  generate,
  // expuestos para tests
  describeTool,
  parseCommand,
  findOnPath,
};
