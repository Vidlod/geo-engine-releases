/**
 * GEO Engine — Driver del agente (Opción A: Agent SDK embebido).
 *
 * Ejecuta las skills geo-* en modo headless sobre la carpeta del proyecto,
 * usando @anthropic-ai/claude-agent-sdk como motor (mismo runtime que el CLI
 * de Claude Code, pero empaquetado dentro de la app — sin instalación aparte).
 *
 * Credenciales (en orden de prioridad):
 *   1. Token guardado por la app (cifrado con safeStorage en userData).
 *   2. Variables de entorno CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY.
 *   3. Sesión existente del CLI de Claude Code (~/.claude), si la hay.
 *
 * El SDK se carga de forma diferida: si el paquete no está disponible,
 * la app degrada al flujo manual (copiar prompt) sin romperse.
 *
 * @module server/agent
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');

/** Skills que la app instala en cada proyecto. */
const SKILL_DIRS = [
  'geo-momento',
  'geo-entregable',
  'geo-introduccion',
  'geo-glosario',
  'geo-linea-tiempo',
];

/** Nombre del archivo de credencial cifrada en userData. */
const CRED_FILE = 'agent-credential.bin';

/* ── Disponibilidad del SDK ───────────────────────────────────────── */

/**
 * El Agent SDK se publica como **ESM puro** (`main: sdk.mjs`). Electron usa
 * Node 20, donde `require()` de un módulo ESM falla (`ERR_REQUIRE_ESM` /
 * `MODULE_NOT_FOUND`). Por eso se carga con `import()` dinámico, resolviendo
 * la ruta en disco con `createRequire` desde este archivo (funciona tanto en
 * desarrollo como empaquetado, donde el paquete va `asarUnpack`).
 *
 * @type {Promise<any|null>|undefined} undefined = no intentado
 */
let sdkPromise;

/** Carga diferida del Agent SDK. @returns {Promise<any|null>} */
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

/* ── Credenciales ─────────────────────────────────────────────────── */

/**
 * @param {string} userDataPath
 * @param {{ isEncryptionAvailable: () => boolean, encryptString: (s:string)=>Buffer, decryptString:(b:Buffer)=>string }} safeStorage
 */
function credPath(userDataPath) {
  return path.join(userDataPath, CRED_FILE);
}

/**
 * Guarda el token (OAuth de `claude setup-token` o API key) cifrado.
 * @param {string} userDataPath
 * @param {any} safeStorage - electron.safeStorage
 * @param {string} token
 */
async function setToken(userDataPath, safeStorage, token) {
  const clean = String(token).trim();
  if (!clean) throw new Error('El token está vacío.');
  const data = safeStorage && safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(clean)
    : Buffer.from(clean, 'utf-8'); // último recurso sin cifrado del SO
  fs.writeFileSync(credPath(userDataPath), data);
  return getStatus(userDataPath, safeStorage);
}

/** @param {string} userDataPath @param {any} safeStorage */
async function clearToken(userDataPath, safeStorage) {
  try { fs.unlinkSync(credPath(userDataPath)); } catch { /* no existía */ }
  return getStatus(userDataPath, safeStorage);
}

/**
 * Lee el token guardado por la app, si existe.
 * @param {string} userDataPath
 * @param {any} safeStorage
 * @returns {string|null}
 */
function readStoredToken(userDataPath, safeStorage) {
  const p = credPath(userDataPath);
  try {
    const raw = fs.readFileSync(p);
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try { return safeStorage.decryptString(raw); } catch { /* texto plano viejo */ }
    }
    return raw.toString('utf-8').trim() || null;
  } catch {
    return null;
  }
}

/** ¿Hay sesión del CLI de Claude Code en esta máquina? */
function hasCliSession() {
  const home = os.homedir();
  return ['.credentials.json', 'settings.json'].some((f) =>
    fs.existsSync(path.join(home, '.claude', f))
  );
}

/**
 * Estado del driver: SDK + credencial detectada.
 * @param {string} userDataPath
 * @param {any} safeStorage
 * @returns {Promise<{sdkAvailable:boolean, hasCredential:boolean, credentialSource:string|null}>}
 */
async function getStatus(userDataPath, safeStorage) {
  const sdkAvailable = (await loadSdk()) !== null;
  const stored = readStoredToken(userDataPath, safeStorage);
  /** @type {string|null} */
  let credentialSource = null;
  if (stored) credentialSource = 'app';
  else if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) credentialSource = 'env';
  else if (hasCliSession()) credentialSource = 'cli';
  return {
    sdkAvailable,
    hasCredential: credentialSource !== null,
    credentialSource,
  };
}

/* ── Skills en el proyecto ────────────────────────────────────────── */

/**
 * Copia (o actualiza) las skills geo-* dentro de `<proyecto>/.claude/skills/`,
 * para que todos los usuarios trabajen con la versión que trae la app.
 * @param {string} projectPath
 * @param {string} skillsSrcPath - Carpeta `skills/` del repo o de resources.
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

/* ── Prompt de generación ─────────────────────────────────────────── */

/**
 * Instrucción headless para una estructura concreta.
 * @param {{ id: string, skill: string, file: string, label: string, numero?: number }} structure
 * @returns {string}
 */
function buildInstruction(structure) {
  const numero = structure.numero ? ` ${structure.numero}` : '';
  return [
    `Ejecuta la skill ${structure.skill} para generar "${structure.label}".`,
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

/* ── Generación headless ──────────────────────────────────────────── */

/**
 * Ejecuta la generación de una estructura con el Agent SDK.
 *
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
  const sdk = await loadSdk();
  if (!sdk) {
    const error = 'El motor de IA no está disponible en esta instalación. Usa "Copiar prompt" como alternativa.';
    emit({ type: 'error', message: error });
    return { ok: false, error };
  }

  const status = await getStatus(userDataPath, safeStorage);
  if (!status.hasCredential) {
    const error = 'No hay una cuenta de Claude conectada. Conéctala desde el panel del proyecto.';
    emit({ type: 'error', message: error });
    return { ok: false, error };
  }

  emit({ type: 'status', message: 'Preparando skills en el proyecto…' });
  const synced = syncSkills(projectPath, skillsSrcPath);
  emit({ type: 'status', message: `Skills listas: ${synced.join(', ') || 'ninguna (revisa la instalación)'}` });

  // Credencial → entorno del agente
  const env = { ...process.env };
  const stored = readStoredToken(userDataPath, safeStorage);
  if (stored) {
    if (stored.startsWith('sk-ant-api')) env.ANTHROPIC_API_KEY = stored;
    else env.CLAUDE_CODE_OAUTH_TOKEN = stored;
  }

  const instruction = buildInstruction(structure);
  emit({ type: 'status', message: `Generando ${structure.label}…` });

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
  getStatus,
  setToken,
  clearToken,
  syncSkills,
  buildInstruction,
  generate,
  // expuesto para tests
  describeTool,
};
