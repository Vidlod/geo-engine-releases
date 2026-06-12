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

/** 
 * Comando por defecto del CLI de Antigravity (editable desde la app).
 * Usamos -p {prompt} para ejecutar en modo headless no interactivo.
 */
const DEFAULT_ANTIGRAVITY_COMMAND = 'antigravity --dangerously-skip-permissions -p {prompt}';

/** Config persistida del agente. */
const CONFIG_FILE = 'agent-config.json';

/* ── Persistencia de configuración ────────────────────────────────── */

/** @param {string} userDataPath */
function configPath(userDataPath) {
  return path.join(userDataPath, CONFIG_FILE);
}

const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-6',
  // Gemini 3 Flash (effort medium): el más rápido para maquetación headless.
  antigravity: 'gemini-3-flash-medium',
};

/** Defaults antiguos que se migran automáticamente al default vigente. */
const LEGACY_CLAUDE_DEFAULTS = ['claude-3-7-sonnet-latest'];

/**
 * @param {string} userDataPath
 * @returns {{ selected: string, claude: { model: string }, antigravity: { command: string, model: string } }}
 */
function readConfig(userDataPath) {
  const base = {
    selected: 'claude',
    claude: { model: DEFAULT_MODELS.claude },
    antigravity: { command: DEFAULT_ANTIGRAVITY_COMMAND, model: DEFAULT_MODELS.antigravity }
  };
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(userDataPath), 'utf-8'));
    return {
      selected: AGENTS.some((a) => a.id === raw.selected) ? raw.selected : 'claude',
      claude: {
        // Migra defaults viejos guardados en disco al modelo vigente (más rápido).
        model: (() => {
          const m = raw.claude && raw.claude.model;
          if (!m || LEGACY_CLAUDE_DEFAULTS.includes(m)) return DEFAULT_MODELS.claude;
          return m;
        })()
      },
      antigravity: {
        command: (raw.antigravity && raw.antigravity.command) || DEFAULT_ANTIGRAVITY_COMMAND,
        model: (raw.antigravity && raw.antigravity.model) || DEFAULT_MODELS.antigravity
      },
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

/** Cambia el modelo de un agente. @param {string} userDataPath @param {any} safeStorage @param {string} agentId @param {string} model */
async function setModel(userDataPath, safeStorage, agentId, model) {
  const cfg = readConfig(userDataPath);
  if (agentId === 'claude') {
    cfg.claude.model = String(model).trim() || DEFAULT_MODELS.claude;
  } else if (agentId === 'antigravity') {
    cfg.antigravity.model = String(model).trim() || DEFAULT_MODELS.antigravity;
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

/**
 * Cuenta de Claude con la que el CLI/SDK está logueado en esta máquina, si la hay.
 *
 * El marcador fiable de "sesión iniciada" en todas las plataformas es el objeto
 * `oauthAccount` de `~/.claude.json` (Claude Code lo escribe al hacer login y
 * guarda ahí el email de la cuenta; en macOS el token en sí va al Llavero, pero
 * la cuenta queda registrada en este archivo). Como respaldo, en Linux/WSL
 * existe `~/.claude/.credentials.json`.
 *
 * NO se usa `~/.claude/settings.json`: es mera configuración y existe aunque no
 * haya login (daba un falso positivo que reventaba recién al generar).
 *
 * @returns {{ email: string|null }} email de la cuenta, o null si no hay sesión
 */
function readClaudeAccount() {
  const home = os.homedir();
  // 1) ~/.claude.json → oauthAccount.emailAddress (señal principal, multiplataforma)
  try {
    const data = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf-8'));
    const email = data && data.oauthAccount && data.oauthAccount.emailAddress;
    if (email) return { email: String(email) };
  } catch { /* sin archivo o ilegible */ }
  // 2) Respaldo: credencial en disco (Linux/WSL)
  if (fs.existsSync(path.join(home, '.claude', '.credentials.json'))) return { email: null };
  return { email: null, _none: true };
}

/**
 * ¿Hay una sesión REAL de Claude Code en esta máquina?
 * @returns {boolean}
 */
function hasCliSession() {
  const acc = readClaudeAccount();
  return !acc._none;
}

/* ── Verificación de sesión del CLI de Antigravity ───────────────── */

/** Caché del resultado del preflight: evita correr agy en cada refresh de UI. */
const _preflightCache = new Map(); // key → { ts: number, result: object }
const PREFLIGHT_TTL = 90_000; // 90 segundos

/**
 * Invalida la caché de preflight para forzar una nueva verificación.
 * Llamar cuando el usuario completa el login o cambia el comando.
 * @param {string} [key]
 */
function invalidateAgyAuthCache(key) {
  if (key) _preflightCache.delete(key);
  else _preflightCache.clear();
}

/**
 * Verifica si el CLI de Antigravity tiene sesión activa ejecutando una prueba
 * con timeout corto (5 s). Si el CLI responde con texto → autenticado.
 * Si se cuelga (intenta abrir navegador para OAuth) → NO autenticado.
 *
 * NOTA: Las cookies del IDE de Antigravity pertenecen al Chromium del IDE
 * y NO indican si el CLI tiene credenciales. Esta función es la única forma
 * fiable de saberlo sin acceso al Keychain.
 *
 * @param {string} [command]  Comando completo (p. ej. 'antigravity' o ruta absoluta)
 * @returns {Promise<{ loggedIn: boolean, reason: string }>}
 */
async function preflightAgyAuth(command) {
  const key = command || 'default';
  const cached = _preflightCache.get(key);
  if (cached && Date.now() - cached.ts < PREFLIGHT_TTL) return cached.result;

  const bin = module.exports.findOnPath(command || 'antigravity');
  if (!bin) {
    const r = { loggedIn: false, reason: 'no_cli' };
    _preflightCache.set(key, { ts: Date.now(), result: r });
    return r;
  }

  const result = await new Promise((resolve) => {
    let output = '';
    let errOutput = '';
    let done = false;

    // Ejecutar con un prompt mínimo y timeout de impresión corto.
    // Si el CLI tiene auth devuelve algo en segundos; si no tiene auth
    // se cuelga intentando abrir el navegador para OAuth.
    const child = spawn(bin, [
      '--dangerously-skip-permissions',
      '-p', '.',
      '--print-timeout', '4s',
    ], {
      cwd: os.tmpdir(),
      env: { ...process.env },
    });

    const finish = (loggedIn, reason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* ya terminó */ }
      resolve({ loggedIn, reason });
    };

    // Cualquier respuesta de texto = CLI autenticado
    child.stdout.on('data', (d) => {
      output += d.toString();
      if (output.trim().length > 2) finish(true, 'response');
    });

    child.stderr.on('data', (d) => {
      errOutput += d.toString();
      // Patrones de error de auth detectados en logs reales del CLI
      if (/not logged|no token|unauthenticated|please.*log|require.*auth|error getting token/i.test(errOutput)) {
        finish(false, 'auth_error');
      }
    });

    // 6 s de espera total: si no responde = necesita auth (se quedó colgado)
    const timer = setTimeout(() => finish(false, 'timeout'), 6000);

    child.on('close', (code) => { if (!done) finish(code === 0, `exit_${code}`); });
    child.on('error', () => finish(false, 'spawn_error'));
  });

  _preflightCache.set(key, { ts: Date.now(), result });
  return result;
}

/**
 * Captura la URL OAuth que agy intenta abrir en el navegador.
 *
 * Funciona interponiendo un script falso de `open` (macOS) / `xdg-open` (Linux)
 * en el PATH antes de lanzar agy. En lugar de abrir el browser, el script
 * escribe la URL en un archivo temporal que este proceso lee.
 *
 * Devuelve { url, child, tmpDir } donde `child` es el proceso de agy que
 * DEBE mantenerse vivo mientras dure el login (tiene el servidor OAuth local).
 * La carpeta `tmpDir` debe limpiarse al terminar.
 *
 * @param {string} [command]
 * @returns {Promise<{ url: string, child: import('child_process').ChildProcess, tmpDir: string } | null>}
 */
async function captureAgyLoginUrl(command) {
  const bin = module.exports.findOnPath(command || 'antigravity');
  if (!bin) return null;

  const tmpDir = path.join(os.tmpdir(), `geo-agy-login-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const urlFile = path.join(tmpDir, 'auth-url.txt');

  // Script que captura la URL en vez de abrir el browser.
  // Busca en todos los argumentos aquél que comience con http/https.
  const captureScript = `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    http*)
      printf '%s' "$arg" > "${urlFile}"
      exit 0
      ;;
  esac
done
`;
  for (const name of ['open', 'xdg-open']) {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, captureScript, { mode: 0o755 });
    try { fs.chmodSync(p, 0o755); } catch (e) { /* ignore */ }
  }

  const child = spawn(bin, [
    '--dangerously-skip-permissions',
    '-p', 'auth',
  ], {
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      // Poner nuestro directorio primero en PATH para interceptar 'open'
      PATH: `${tmpDir}:${process.env.PATH || ''}`,
      BROWSER: path.join(tmpDir, 'open'), // fallback para Linux
    },
  });

  // Leer el archivo cada 400 ms (max 12 s = 30 intentos)
  const url = await new Promise((resolve) => {
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      try {
        const content = fs.readFileSync(urlFile, 'utf-8').trim();
        if (content && content.startsWith('http')) { clearInterval(iv); resolve(content); return; }
      } catch { /* aún no existe */ }
      if (attempts >= 30) { clearInterval(iv); resolve(null); }
    }, 400);
  });

  if (!url) {
    try { child.kill('SIGKILL'); } catch { /* ya terminó */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    return null;
  }

  return { url, child, tmpDir };
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

  // 1. Intentar buscar en el PATH del sistema
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(probe, [first], { encoding: 'utf-8' });
    if (r.status === 0) {
      const line = String(r.stdout).split(/\r?\n/).find((l) => l.trim());
      if (line && fs.existsSync(line.trim())) return line.trim();
    }
  } catch { /* sin PATH utilizable */ }

  // 2. Si no está en el PATH, buscar en las carpetas comunes de instalación por defecto
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const binName = isWin ? `${first}.exe` : first;
  const altBinName = isWin ? 'agy.exe' : 'agy';

  const commonPaths = isWin
    ? [
        path.join(home, '.local', 'bin', binName),
        path.join(home, '.local', 'bin', altBinName),
        path.join(home, 'AppData', 'Local', 'Programs', 'antigravity-cli', 'bin', binName),
        path.join(home, 'AppData', 'Local', 'Programs', 'antigravity-cli', 'bin', altBinName),
      ]
    : [
        path.join(home, '.local', 'bin', binName),
        path.join(home, '.local', 'bin', altBinName),
        path.join(home, '.gemini', 'antigravity-cli', 'bin', binName),
        path.join(home, '.gemini', 'antigravity-cli', 'bin', altBinName),
      ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

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
  const claudeAccount = readClaudeAccount();
  let claudeSource = null;
  let claudeAccountEmail = null;
  if (claudeStored) claudeSource = 'app';
  else if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) claudeSource = 'env';
  else if (!claudeAccount._none) { claudeSource = 'cli'; claudeAccountEmail = claudeAccount.email; }

  // Antigravity (CLI)
  const agCommand = cfg.antigravity.command;
  const agResolved = module.exports.findOnPath(agCommand);
  // Usar caché del preflight si existe (el preflight corre agy con timeout real)
  const agCached = _preflightCache.get(agCommand || 'default');
  // loggedIn: null = todavía no se ha hecho preflight (UI muestra "Verificar")
  const agLoggedIn = agCached ? agCached.result.loggedIn : null;

  const agents = [
    {
      id: 'claude',
      label: 'Claude Code',
      kind: 'sdk',
      available: sdkAvailable,
      hasCredential: claudeSource !== null,
      credentialSource: claudeSource,
      account: claudeAccountEmail,
      model: cfg.claude.model,
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      kind: 'cli',
      available: agResolved !== null,
      // null = sin verificar aún; false = sin sesión; true = OK
      hasCredential: agLoggedIn === true,
      sessionChecked: agLoggedIn !== null,
      sessionLoggedIn: agLoggedIn,
      credentialSource: agLoggedIn === true ? 'cli' : null,
      command: agCommand,
      resolvedPath: agResolved,
      model: cfg.antigravity.model,
    },
  ];

  return { selected: cfg.selected, agents };
}

/* ── Skills en el proyecto ────────────────────────────────────────── */

/**
 * Copia (o actualiza) las skills geo-* dentro de `<proyecto>/.claude/skills/` y `<proyecto>/.agent/skills/`.
 *
 * Si se indica `only`, instala SOLO esa skill y elimina las demás del
 * proyecto: así el agente no carga descripciones de skills que no va a usar
 * (menos contexto = generación más rápida y precisa).
 *
 * @param {string} projectPath @param {string} skillsSrcPath
 * @param {string} [only] - nombre de la única skill a instalar (p. ej. 'geo-momento')
 * @returns {string[]} skills sincronizadas
 */
function syncSkills(projectPath, skillsSrcPath, only) {
  const synced = [];
  const wanted = only ? SKILL_DIRS.filter((n) => n === only) : SKILL_DIRS;
  const roots = [
    path.join(projectPath, '.claude', 'skills'),
    path.join(projectPath, '.agent', 'skills')
  ];

  for (const dstRoot of roots) {
    for (const name of SKILL_DIRS) {
      const dst = path.join(dstRoot, name);
      fs.rmSync(dst, { recursive: true, force: true });
      if (!wanted.includes(name)) continue;
      const src = path.join(skillsSrcPath, name);
      if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
      fs.cpSync(src, dst, { recursive: true });
      if (!synced.includes(name)) {
        synced.push(name);
      }
    }
  }
  return synced;
}

/**
 * Fecha de última modificación del SKILL.md fuente (verificación visible de
 * que la skill que se le pasa al agente es la versión actual).
 * @param {string} skillsSrcPath @param {string} skillName
 * @returns {string|null} fecha legible o null
 */
function skillSourceDate(skillsSrcPath, skillName) {
  try {
    const st = fs.statSync(path.join(skillsSrcPath, skillName, 'SKILL.md'));
    return st.mtime.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return null;
  }
}

/* ── Insumos relevantes por segmento ──────────────────────────────── */

/**
 * Qué insumo alimenta cada skill (regla del flujo GEO):
 *   • AAA (.docx)                → Momentos, Introducción al curso, Línea de tiempo
 *   • "Introducción al Curso" PDF → Entregables
 *   • Rúbrica (.xlsx)            → Glosario
 * Pasarle al agente solo su insumo evita saturarlo con archivos de más.
 * @type {Record<string, RegExp[]>}
 */
const INSUMO_RULES = {
  'geo-momento': [/(^|[^a-z])aaa([^a-z]|$)/i],
  'geo-introduccion': [/(^|[^a-z])aaa([^a-z]|$)/i],
  'geo-linea-tiempo': [/(^|[^a-z])aaa([^a-z]|$)/i],
  'geo-entregable': [/introducci[oó]n/i],
  'geo-glosario': [/r[uú]brica/i],
};

/**
 * Filtra los insumos del proyecto dejando solo los que corresponden a la
 * skill del segmento. Si ninguno coincide, devuelve la lista completa
 * (mejor pasar de más que dejar al agente sin material).
 * @param {string} skillName
 * @param {string[]} insumos - nombres de archivo en insumos/
 * @returns {{ files: string[], matched: boolean }}
 */
function relevantInsumos(skillName, insumos) {
  const rules = INSUMO_RULES[skillName];
  if (!rules || !insumos.length) return { files: insumos, matched: false };
  const files = insumos.filter((name) => rules.some((re) => re.test(name)));
  return files.length ? { files, matched: true } : { files: insumos, matched: false };
}

/**
 * Lista los archivos de insumos/ del proyecto (incluye subcarpetas de 1 nivel).
 * @param {string} projectPath
 * @returns {string[]}
 */
function listInsumos(projectPath) {
  const dir = path.join(projectPath, 'insumos');
  /** @type {string[]} */
  const out = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isFile()) out.push(entry.name);
      else if (entry.isDirectory()) {
        for (const sub of fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })) {
          if (sub.isFile() && !sub.name.startsWith('.')) out.push(path.join(entry.name, sub.name));
        }
      }
    }
  } catch { /* sin carpeta insumos */ }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

/* ── Prompt de generación (agnóstico al agente) ───────────────────── */

/**
 * Instrucción headless para una estructura concreta. Referencia la skill por
 * su archivo (`.claude/skills/<skill>/SKILL.md`) para que cualquier agente la
 * pueda seguir, no solo el que tiene cargador nativo de skills.
 * @param {{ id: string, skill: string, file: string, label: string, numero?: number }} structure
 * @returns {string}
 */
function buildInstruction(structure, insumoFiles) {
  const numero = structure.numero ? ` ${structure.numero}` : '';
  const files = Array.isArray(insumoFiles) ? insumoFiles : [];
  const insumosLine = files.length
    ? [
        'Insumos a leer (ÚNICAMENTE estos; los demás archivos de insumos/ NO',
        `corresponden a este segmento y leerlos solo te hará más lento):`,
        ...files.map((f) => `  - insumos/${f}`),
      ]
    : ['Insumos del curso: carpeta insumos/ (la AAA es la fuente autoritativa).'];
  return [
    `Tarea: generar "${structure.label}" del curso.`,
    `Sigue al pie de la letra la skill en .claude/skills/${structure.skill}/SKILL.md`,
    'y sus archivos de referencia (reglas-transversales y genéricos).',
    ...insumosLine,
    'Configuración e IDs de Moodle: curso.yaml en la raíz del proyecto',
    '(incluye el MAPA DE ARCHIVOS en la clave files: — usa esos nombres exactos,',
    'no inventes nombres de archivo).',
    `Número de la estructura:${numero || ' n/a'}.`,
    `Escribe el HTML final en generadas/${structure.file} (sobrescribe si existe).`,
    'Ve directo al grano: no explores el proyecto con búsquedas; lee la skill,',
    'los insumos indicados y curso.yaml, y escribe el resultado.',
    'No ejecutes comandos externos (no hay cli.py aquí): la app pasa su propio',
    'linter después de generar.',
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
async function claudeGenerate({ sdk, projectPath, env, instruction, emit, structure, model }) {
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
        model: model,
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
 * @param {string} command @param {string} instruction @param {string} model
 * @returns {{ tokens: string[], promptViaStdin: boolean }}
 */
function parseCommand(command, instruction, model) {
  let parts = command.trim().split(/\s+/).filter(Boolean);

  const hasModelFlag = parts.includes('-m') || parts.includes('--model') || parts.includes('{model}');
  const hasDangerFlag = parts.includes('--dangerously-skip-permissions');
  const isAgy = parts[0] && (parts[0] === 'antigravity' || parts[0] === 'agy' || parts[0].endsWith('/antigravity') || parts[0].endsWith('/agy'));
  
  // Si el comando es exactamente el binario de Antigravity sin más argumentos,
  // auto-completamos con las banderas de modelo, permisos y prompt por defecto.
  if (isAgy && parts.length === 1) {
    parts.push('--dangerously-skip-permissions', '--model', '{model}', '-p', '{prompt}');
  } else if (isAgy) {
    // Si tiene argumentos pero no bandera de modelo, la insertamos antes de -p o {prompt} si existen
    if (!hasModelFlag) {
      const pIdx = parts.indexOf('-p');
      if (pIdx !== -1) {
        parts.splice(pIdx, 0, '--model', '{model}');
      } else {
        const promptIdx = parts.indexOf('{prompt}');
        if (promptIdx !== -1) {
          parts.splice(promptIdx, 0, '--model', '{model}');
        }
      }
    }
    // Auto-inyectar --dangerously-skip-permissions si ejecuta en modo print/headless y no la tiene
    if (!hasDangerFlag && (parts.includes('-p') || parts.includes('{prompt}'))) {
      parts.splice(1, 0, '--dangerously-skip-permissions');
    }
  }

  let promptViaStdin = !parts.includes('{prompt}');
  const tokens = parts.map((t) => {
    if (t === '{prompt}') { return instruction; }
    if (t === '{model}') { return model; }
    return t;
  });
  return { tokens, promptViaStdin };
}

/**
 * Ejecuta el CLI externo (Antigravity) y transmite su salida.
 * @param {object} ctx
 * @param {string} ctx.command @param {string} ctx.projectPath @param {object} ctx.env
 * @param {string} ctx.instruction @param {(e:object)=>void} ctx.emit
 * @param {{file:string,label:string}} ctx.structure @param {string} ctx.model
 * @returns {Promise<{ok:boolean,file?:string,error?:string}>}
 */
function cliGenerate({ command, projectPath, env, instruction, emit, structure, model }) {
  return new Promise((resolve) => {
    const bin = module.exports.findOnPath(command);
    if (!bin) {
      const error = `No se encontró el comando "${command.split(/\s+/)[0]}" en el PATH. Configúralo en el panel del agente.`;
      emit({ type: 'error', message: error });
      resolve({ ok: false, error });
      return;
    }

    const { tokens, promptViaStdin } = parseCommand(command, instruction, model);
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

    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(hardTimeout);
      resolve(result);
    };

    // Timeout máximo: si el CLI no termina en 12 minutos, lo matamos.
    // Esto evita el cuelgue indefinido cuando agy no tiene sesión activa.
    const TIMEOUT_MS = 12 * 60 * 1000;
    const hardTimeout = setTimeout(() => {
      if (resolved) return;
      try { child.kill('SIGTERM'); } catch { /* ya terminó */ }
      const error =
        'El CLI de Antigravity superó el tiempo límite (12 min) sin responder. ' +
        'Causa más probable: el CLI no tiene sesión iniciada. ' +
        'Abre el Antigravity IDE, inicia sesión con tu cuenta Google y vuelve a intentarlo.';
      emit({ type: 'error', message: error });
      finish({ ok: false, error });
    }, TIMEOUT_MS);

    // Frases que el CLI emite cuando NO tiene sesión (detectadas en logs reales)
    const AUTH_ERROR_PATTERNS = [
      /not logged into antigravity/i,
      /you are not logged/i,
      /no token found/i,
      /error getting token source/i,
      /unauthenticated/i,
      /please log in/i,
      /login required/i,
      /authentication required/i,
    ];

    /** Vuelca líneas de salida y detecta llamadas a herramientas del CLI */
    const pump = (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;

        // Detectar errores de autenticación en tiempo real y cancelar inmediatamente
        if (AUTH_ERROR_PATTERNS.some((re) => re.test(t))) {
          try { child.kill('SIGTERM'); } catch { /* ya terminó */ }
          const error =
            'Antigravity CLI no tiene sesión iniciada. ' +
            'Abre el Antigravity IDE, inicia sesión con tu cuenta Google y vuelve a intentarlo. ' +
            `(Detalle: ${t.slice(0, 200)})`;
          emit({ type: 'error', message: error });
          finish({ ok: false, error });
          return;
        }

        // Detectar si la línea de salida del CLI hace referencia a herramientas comunes
        let matchedTool = null;
        if (t.includes('read_file') || t.includes('view_file') || t.includes('Analyzing directory') || t.includes('Reading')) {
          matchedTool = 'Leyendo archivo…';
        } else if (t.includes('write_file') || t.includes('replace_file_content') || t.includes('Editing file') || t.includes('Writing')) {
          matchedTool = 'Escribiendo archivo…';
        } else if (t.includes('run_command') || t.includes('command') || t.includes('Running command') || t.includes('Executing')) {
          matchedTool = 'Ejecutando comando…';
        } else if (t.includes('grep_search') || t.includes('Searching') || t.includes('Buscando')) {
          matchedTool = 'Buscando en insumos…';
        }

        if (matchedTool) {
          emit({ type: 'tool', message: matchedTool });
        } else {
          emit({ type: 'text', message: t.slice(0, 400) });
        }
      }
    };
    if (child.stdout) child.stdout.on('data', pump);
    if (child.stderr) child.stderr.on('data', pump);

    child.on('error', (err) => {
      const error = `Error del CLI: ${err && err.message}`;
      emit({ type: 'error', message: error });
      finish({ ok: false, error });
    });

    child.on('close', (code) => {
      if (resolved) return; // ya cancelado por timeout o auth-error
      const outFile = path.join(projectPath, 'generadas', structure.file);
      if (code === 0 && fs.existsSync(outFile)) {
        emit({ type: 'done', message: 'Generación terminada.', file: structure.file });
        finish({ ok: true, file: structure.file });
      } else if (code === 0) {
        const error = `El CLI terminó pero no se encontró generadas/${structure.file}. Revisa el comando configurado.`;
        emit({ type: 'error', message: error });
        finish({ ok: false, error });
      } else {
        const error = `El CLI terminó con código ${code}.`;
        emit({ type: 'error', message: error });
        finish({ ok: false, error });
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

  // ── Verificación de sesión ANTES de empezar (evita colgarse 20 min) ──
  if (selected.kind === 'cli' && selected.id === 'antigravity') {
    emit({ type: 'status', message: 'Verificando sesión de Antigravity CLI (≤6 s)…' });
    const authCheck = await module.exports.preflightAgyAuth(selected.command);
    if (!authCheck.loggedIn) {
      const hint = authCheck.reason === 'timeout'
        ? 'El CLI no respondió (se colgó esperando autenticación).'
        : `Razón: ${authCheck.reason}.`;
      const error =
        `Antigravity CLI no tiene sesión activa. ${hint} ` +
        'Usa el botón "Conectar" en el panel del agente para iniciar sesión sin salir de GEO Engine.';
      emit({ type: 'error', message: error });
      return { ok: false, error };
    }
    emit({ type: 'status', message: 'Sesión de Antigravity verificada ✓' });
  } else if (!selected.hasCredential) {
    const error = `No hay una cuenta conectada para ${selected.label}. Conéctala desde el panel del agente.`;
    emit({ type: 'error', message: error });
    return { ok: false, error };
  }

  emit({ type: 'status', message: 'Preparando skills en el proyecto…' });
  // Solo la skill del segmento: el agente no carga las otras cuatro.
  const synced = syncSkills(projectPath, skillsSrcPath, structure.skill);
  if (!synced.length) {
    const error = `La skill ${structure.skill} no está en la instalación de la app.`;
    emit({ type: 'error', message: error });
    return { ok: false, error };
  }
  const srcDate = skillSourceDate(skillsSrcPath, structure.skill);
  emit({
    type: 'status',
    message: `Skill ${structure.skill} sincronizada${srcDate ? ` (versión del ${srcDate})` : ''}.`,
  });

  // Regenerar = sobrescribir: la versión anterior se respalda en .geo/backups
  // y se elimina de generadas/, así el agente siempre escribe desde cero.
  const outFile = path.join(projectPath, 'generadas', structure.file);
  if (fs.existsSync(outFile)) {
    try {
      const backupDir = path.join(projectPath, '.geo', 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupName = structure.file.replace(/\.html?$/i, '') + `.${stamp}.html`;
      fs.copyFileSync(outFile, path.join(backupDir, backupName));
      fs.unlinkSync(outFile);
      emit({ type: 'status', message: `Versión anterior respaldada (.geo/backups/${backupName}); se regenera desde cero.` });
    } catch (err) {
      emit({ type: 'status', message: `No se pudo respaldar la versión anterior: ${err && err.message}` });
    }
  }

  // Solo los insumos del segmento (AAA → momentos/introducción/línea de tiempo,
  // Introducción PDF → entregables, Rúbrica → glosario).
  const allInsumos = listInsumos(projectPath);
  const { files: insumoFiles, matched } = relevantInsumos(structure.skill, allInsumos);
  if (matched) {
    emit({ type: 'status', message: `Insumos del segmento: ${insumoFiles.join(', ')}` });
  } else if (allInsumos.length) {
    emit({ type: 'status', message: 'Sin insumo específico para este segmento; se pasa la lista completa.' });
  }

  const env = { ...process.env };
  const instruction = buildInstruction(structure, matched ? insumoFiles : allInsumos);
  emit({ type: 'status', message: `Generando ${structure.label} con ${selected.label}…` });

  if (selected.kind === 'sdk') {
    const sdk = await loadSdk();
    // Credencial → entorno del agente
    const stored = readStoredToken(userDataPath, safeStorage, 'claude');
    if (stored) {
      if (stored.startsWith('sk-ant-api')) env.ANTHROPIC_API_KEY = stored;
      else env.CLAUDE_CODE_OAUTH_TOKEN = stored;
    }
    env.CLAUDE_MODEL = selected.model;
    env.ANTHROPIC_MODEL = selected.model;
    return claudeGenerate({ sdk, projectPath, env, instruction, emit, structure, model: selected.model });
  }

  // CLI (Antigravity)
  const stored = readStoredToken(userDataPath, safeStorage, selected.id);
  if (stored) env.GEO_AGENT_TOKEN = stored; // disponible por si el CLI lo usa
  env.GEMINI_MODEL = selected.model;
  env.ANTIGRAVITY_MODEL = selected.model;
  return cliGenerate({ command: selected.command, projectPath, env, instruction, emit, structure, model: selected.model });
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
  readConfig,
  getStatus,
  selectAgent,
  setModel,
  setToken,
  clearToken,
  setCommand,
  syncSkills,
  buildInstruction,
  generate,
  // expuestos para tests y para main.js
  describeTool,
  parseCommand,
  findOnPath,
  preflightAgyAuth,
  captureAgyLoginUrl,
  invalidateAgyAuthCache,
  relevantInsumos,
  listInsumos,
};
