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
  // Vacío = usar el modelo por defecto del CLI de Antigravity. Los IDs reales
  // se obtienen de `agy models` cuando hay sesión; no se inventan.
  antigravity: '',
};

/** Defaults antiguos que se migran automáticamente al default vigente. */
const LEGACY_CLAUDE_DEFAULTS = ['claude-3-7-sonnet-latest'];
const LEGACY_ANTIGRAVITY_DEFAULTS = ['gemini-3-flash-medium'];

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
        model: (() => {
          const m = raw.antigravity && raw.antigravity.model;
          if (!m || LEGACY_ANTIGRAVITY_DEFAULTS.includes(m)) return DEFAULT_MODELS.antigravity;
          return m;
        })()
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
 * La señal fiable es la CREDENCIAL real, no `oauthAccount` de `~/.claude.json`:
 * ese objeto puede quedar como residuo de un login viejo o de la app de
 * escritorio de Claude, y el runtime del SDK responde "Not logged in" aunque
 * exista (falso positivo que terminaba en generaciones vacías → ENOENT).
 *
 *   - macOS:      ítem del Llavero "Claude Code-credentials"
 *   - Linux/WSL/Windows: ~/.claude/.credentials.json
 *
 * El email se toma de `oauthAccount` solo como dato informativo.
 *
 * @returns {{ email: string|null, _none?: boolean }}
 */
function readClaudeAccount() {
  const home = os.homedir();
  let hasCredential = false;

  if (process.platform === 'darwin') {
    try {
      const r = spawnSync('security', ['find-generic-password', '-s', 'Claude Code-credentials'],
        { timeout: 8000, stdio: 'ignore' });
      hasCredential = r.status === 0;
    } catch { /* security no disponible */ }
  }
  if (!hasCredential) {
    hasCredential = fs.existsSync(path.join(home, '.claude', '.credentials.json'));
  }
  if (!hasCredential) return { email: null, _none: true };

  let email = null;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf-8'));
    email = (data && data.oauthAccount && data.oauthAccount.emailAddress) || null;
  } catch { /* sin archivo */ }
  return { email };
}

/**
 * Binario `claude` empaquetado con el Agent SDK (mismo runtime que usa la app
 * para generar): permite iniciar sesión sin instalar Claude Code aparte.
 * @returns {string|null}
 */
function findBundledClaude() {
  try {
    const req = createRequire(__filename);
    const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
    const bin = path.join(
      path.dirname(req.resolve(`${pkg}/package.json`)),
      process.platform === 'win32' ? 'claude.exe' : 'claude'
    );
    if (fs.existsSync(bin)) return bin;
  } catch { /* paquete de plataforma no instalado */ }
  return null;
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
 * Comprueba si el CLI de Antigravity tiene sesión activa con `agy models`:
 * es rápido, NUNCA abre el navegador (a diferencia del modo -p, que sin
 * sesión dispara el flujo OAuth y abría pestañas de login en cada chequeo) y,
 * cuando hay sesión, devuelve además los IDs reales de modelos disponibles.
 *
 * NOTA: Las cookies del IDE de Antigravity pertenecen al Chromium del IDE
 * y NO indican si el CLI tiene credenciales. Esta función es la única forma
 * fiable de saberlo sin acceso al Keychain.
 *
 * @param {string} [command]  Comando completo (p. ej. 'antigravity' o ruta absoluta)
 * @param {boolean} [force]   Ignorar la caché (tras login/logout)
 * @returns {Promise<{ loggedIn: boolean, reason: string, models: string[] }>}
 */
async function preflightAgyAuth(command, force = false) {
  const key = command || 'default';
  const cached = _preflightCache.get(key);
  if (!force && cached && Date.now() - cached.ts < PREFLIGHT_TTL) return cached.result;

  const bin = module.exports.findOnPath(command || 'antigravity');
  if (!bin) {
    const r = { loggedIn: false, reason: 'no_cli', models: [] };
    _preflightCache.set(key, { ts: Date.now(), result: r });
    return r;
  }

  /** @type {{ loggedIn: boolean, reason: string, models: string[] }} */
  let result;
  try {
    const r = spawnSync(bin, ['models'], {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: os.tmpdir(),
      env: { ...process.env },
    });
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (r.status === 0 && !/sign in|log ?in/i.test(out)) {
      // Con sesión: cada línea de la salida lista un modelo disponible.
      const models = [...new Set(
        out.split(/\r?\n/)
          .map((l) => (l.trim().match(/^([a-z0-9][a-z0-9._-]{2,})/i) || [])[1])
          .filter((m) => m && !/^(available|usage|model|models|error|name)$/i.test(m))
      )];
      result = { loggedIn: true, reason: 'models', models };
    } else {
      result = { loggedIn: false, reason: 'auth_required', models: [] };
    }
  } catch {
    result = { loggedIn: false, reason: 'spawn_error', models: [] };
  }

  _preflightCache.set(key, { ts: Date.now(), result });
  return result;
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
        path.join(home, 'AppData', 'Local', 'agy', 'bin', binName),
        path.join(home, 'AppData', 'Local', 'agy', 'bin', altBinName),
      ]
    : [
        path.join(home, '.local', 'bin', binName),
        path.join(home, '.local', 'bin', altBinName),
        path.join(home, '..', '.local', 'bin', binName), // Unix dynamic target fallback
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

/* ── Login / Logout (flujo de una sola vez, como una app normal) ──── */

/**
 * Abre un comando en la terminal del sistema (visible para el usuario).
 * Necesario para los flujos OAuth interactivos de los CLI.
 * @param {string} commandPath - ruta del binario a ejecutar (sin argumentos)
 */
function openInTerminal(commandPath) {
  if (process.platform === 'darwin') {
    const child = spawn('osascript', [
      '-e', `tell application "Terminal" to do script ${JSON.stringify(commandPath)}`,
      '-e', 'tell application "Terminal" to activate',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
  } else if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/c', 'start', 'GEO Engine - Iniciar sesion', 'cmd', '/k', commandPath],
      { detached: true, stdio: 'ignore', windowsVerbatimArguments: false });
    child.unref();
  } else {
    const child = spawn('x-terminal-emulator', ['-e', commandPath], { detached: true, stdio: 'ignore' });
    child.unref();
  }
}

/**
 * Inicia el flujo de sesión del agente. Abre UNA terminal con el CLI: el CLI
 * redirige al navegador una sola vez y la sesión queda guardada en el equipo.
 *
 * @param {string} userDataPath @param {any} safeStorage @param {string} agentId
 * @returns {Promise<{ opened: boolean, message: string }>}
 */
async function login(userDataPath, safeStorage, agentId) {
  if (agentId === 'antigravity') {
    const cfg = readConfig(userDataPath);
    const bin = module.exports.findOnPath(cfg.antigravity.command)
      || module.exports.findOnPath('agy')
      || module.exports.findOnPath('antigravity');
    if (!bin) {
      throw new Error('No se encontró el CLI de Antigravity en este equipo. Instálalo primero.');
    }
    invalidateAgyAuthCache();
    openInTerminal(bin);
    return {
      opened: true,
      message: 'Se abrió una terminal con Antigravity. Inicia sesión con tu cuenta (una sola vez) y luego pulsa «Ya inicié sesión».',
    };
  }
  if (agentId === 'claude') {
    // Preferir el binario que la app trae embebida (no requiere instalación);
    // como respaldo, un claude instalado por el usuario.
    const bin = findBundledClaude()
      || module.exports.findOnPath('claude')
      || module.exports.findOnPath(path.join(os.homedir(), '.claude', 'local', 'claude'));
    if (bin) {
      openInTerminal(`${JSON.stringify(bin)} /login`);
      return {
        opened: true,
        message: 'Se abrió una terminal con Claude. Completa el inicio de sesión en el navegador (una sola vez) y luego pulsa «Ya inicié sesión».',
      };
    }
    throw new Error(
      'No se encontró el runtime de Claude. Reinstala la app o pega un token en «Usar token/API key…».'
    );
  }
  throw new Error(`Agente desconocido: ${agentId}`);
}

/**
 * Cierra la sesión del agente.
 *
 * - claude con token de la app → se borra el token cifrado.
 * - claude con sesión de Claude Code → se elimina la sesión del equipo
 *   (oauthAccount de ~/.claude.json + credencial del Llavero/credentials.json).
 * - antigravity → su CLI no expone logout por comando; se abre el CLI para
 *   cerrarla desde ahí.
 *
 * @param {string} userDataPath @param {any} safeStorage @param {string} agentId
 * @returns {Promise<{ message: string }>}
 */
async function logout(userDataPath, safeStorage, agentId) {
  if (agentId === 'claude') {
    const stored = readStoredToken(userDataPath, safeStorage, 'claude');
    if (stored) {
      await clearToken(userDataPath, safeStorage, 'claude');
      return { message: 'Se eliminó el token guardado en la app.' };
    }
    const home = os.homedir();
    try {
      const file = path.join(home, '.claude.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      delete data.oauthAccount;
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch { /* sin archivo */ }
    if (process.platform === 'darwin') {
      try {
        spawnSync('security', ['delete-generic-password', '-s', 'Claude Code-credentials'], { timeout: 8000 });
      } catch { /* sin entrada en el Llavero */ }
    }
    try { fs.unlinkSync(path.join(home, '.claude', '.credentials.json')); } catch { /* no existía */ }
    return { message: 'Sesión de Claude Code cerrada en este equipo.' };
  }
  if (agentId === 'antigravity') {
    const cfg = readConfig(userDataPath);
    const bin = module.exports.findOnPath(cfg.antigravity.command);
    invalidateAgyAuthCache();
    if (bin) openInTerminal(bin);
    return {
      message: 'Antigravity gestiona su sesión desde el CLI: en la terminal que se abrió usa el comando de cierre de sesión.',
    };
  }
  throw new Error(`Agente desconocido: ${agentId}`);
}

/* ── Métodos auxiliares para instalador y actualizador de Antigravity ── */

/**
 * Mapea la plataforma/arquitectura a los identificadores del manifiesto oficial.
 * @returns {string|null}
 */
function getAgyPlatform() {
  const osPlatform = process.platform;
  const arch = process.arch;

  if (osPlatform === 'win32') {
    if (arch === 'x64') return 'windows_amd64';
    if (arch === 'arm64') return 'windows_arm64';
  } else if (osPlatform === 'darwin') {
    if (arch === 'x64') return 'darwin_amd64';
    if (arch === 'arm64') return 'darwin_arm64';
  } else if (osPlatform === 'linux') {
    const isMusl = (() => {
      try {
        if (fs.existsSync('/lib/libc.musl-x86_64.so.1') || fs.existsSync('/lib/libc.musl-aarch64.so.1')) {
          return true;
        }
      } catch {}
      return false;
    })();
    const mappedArch = arch === 'x64' ? 'amd64' : (arch === 'arm64' ? 'arm64' : arch);
    return isMusl ? `linux_${mappedArch}_musl` : `linux_${mappedArch}`;
  }
  return null;
}

/**
 * Consulta la versión local del CLI ejecutando --version o version.
 * @param {string} binPath
 * @returns {string|null}
 */
function getLocalCliVersion(binPath) {
  if (!binPath || !fs.existsSync(binPath)) return null;
  try {
    const r = spawnSync(binPath, ['--version'], { encoding: 'utf-8', timeout: 5000 });
    if (r.status === 0) {
      const match = r.stdout.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : r.stdout.trim();
    }
  } catch (err) {
    console.error('[agent] Error checking local version with --version:', err.message);
  }
  try {
    const r = spawnSync(binPath, ['version'], { encoding: 'utf-8', timeout: 5000 });
    if (r.status === 0) {
      const match = r.stdout.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : r.stdout.trim();
    }
  } catch (err) {
    console.error('[agent] Error checking local version with version:', err.message);
  }
  return null;
}

/**
 * Obtiene el manifiesto remoto de la versión del CLI de Antigravity.
 * @param {string} platform
 * @returns {Promise<{ version: string, url: string, sha512: string }>}
 */
function fetchLatestAgyManifest(platform) {
  return new Promise((resolve, reject) => {
    if (!platform) {
      reject(new Error('Plataforma no soportada para Antigravity CLI'));
      return;
    }
    const https = require('https');
    const url = `https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/${platform}.json`;
    const req = https.get(url, { headers: { 'User-Agent': 'GEO-Engine' }, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP status ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout fetching remote manifest')));
  });
}

/**
 * Compara dos versiones SemVer.
 * @param {string} latest
 * @param {string} current
 * @returns {boolean}
 */
function isNewerCliVersion(latest, current) {
  if (!latest) return false;
  if (!current) return true;
  const pa = String(latest).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(current).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/**
 * Descarga e instala (o actualiza) el CLI de Antigravity utilizando los scripts oficiales.
 * @returns {Promise<{ version: string }>}
 */
async function downloadAndInstallCli() {
  const osPlatform = process.platform;
  const isWin = osPlatform === 'win32';
  
  let cmd, args;
  if (isWin) {
    cmd = 'powershell.exe';
    args = ['-ExecutionPolicy', 'Bypass', '-Command', 'irm https://antigravity.google/cli/install.ps1 | iex'];
  } else {
    cmd = '/bin/bash';
    args = ['-c', 'curl -fsSL https://antigravity.google/cli/install.sh | bash'];
  }

  return new Promise((resolve, reject) => {
    console.log(`[agent] Iniciando descarga e instalación de Antigravity CLI mediante: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      shell: false,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      console.log(`[agent] Script de instalación finalizó con código: ${code}`);
      if (code !== 0) {
        reject(new Error(`La instalación falló con código ${code}.\nStdout: ${stdout}\nStderr: ${stderr}`));
        return;
      }
      
      // Invalidar la caché de autenticación de agy para forzar reverificación
      invalidateAgyAuthCache();
      
      // Intentar obtener la versión recién instalada
      const resolved = module.exports.findOnPath('agy') || module.exports.findOnPath('antigravity');
      const installedVersion = getLocalCliVersion(resolved) || 'instalado';
      
      resolve({ version: installedVersion });
    });
  });
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

  // Antigravity (CLI): la sesión se sondea siempre con `agy models` — es
  // seguro (nunca abre navegador), rápido y queda cacheado 90 s, así que la
  // UI ya no necesita un estado "sin verificar" ni botón de verificación.
  const agCommand = cfg.antigravity.command;
  const agResolved = module.exports.findOnPath(agCommand);
  const agProbe = agResolved
    ? await module.exports.preflightAgyAuth(agCommand)
    : { loggedIn: false, reason: 'no_cli', models: [] };

  // Versiones del CLI de Antigravity
  const agVersion = getLocalCliVersion(agResolved);
  let agLatestVersion = null;
  let agUpdateAvailable = false;
  try {
    const platform = getAgyPlatform();
    if (platform) {
      const manifest = await fetchLatestAgyManifest(platform);
      agLatestVersion = manifest.version;
      agUpdateAvailable = isNewerCliVersion(agLatestVersion, agVersion);
    }
  } catch (err) {
    console.error('[agent] Error fetching remote manifest for version check:', err.message);
  }

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
      hasCredential: agProbe.loggedIn,
      sessionChecked: true,
      sessionLoggedIn: agProbe.loggedIn,
      credentialSource: agProbe.loggedIn ? 'cli' : null,
      command: agCommand,
      resolvedPath: agResolved,
      model: cfg.antigravity.model,
      // IDs reales que reporta el CLI (vacío sin sesión)
      models: agProbe.models,
      cliVersion: agVersion,
      cliLatestVersion: agLatestVersion,
      cliUpdateAvailable: agUpdateAvailable,
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
  // Acepta nombres simples ('AAA.docx') o entradas de extract.js
  // ({ original, text, converted }) con la ruta del texto ya extraído.
  const files = (Array.isArray(insumoFiles) ? insumoFiles : []).map((f) =>
    typeof f === 'string'
      ? { original: `insumos/${f}`, text: `insumos/${f}`, converted: false }
      : f
  );
  const insumosLine = files.length
    ? [
        'Insumos a leer (ÚNICAMENTE estos; los demás archivos de insumos/ NO',
        'corresponden a este segmento y leerlos solo te hará más lento):',
        ...files.map((f) => f.converted
          ? `  - ${f.text}  (texto ya extraído de ${f.original}; lee SOLO el .md, no abras el original)`
          : `  - ${f.text}`),
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
          // "success" del SDK solo significa que la conversación terminó:
          // verificar que el HTML realmente se escribió (antes esto producía
          // un ENOENT al abrir un archivo que nunca existió).
          const outFile = path.join(projectPath, 'generadas', structure.file);
          if (fs.existsSync(outFile)) {
            emit({ type: 'done', message: 'Generación terminada.', file: structure.file });
            return { ok: true, file: structure.file };
          }
          const error =
            `El agente terminó pero no escribió generadas/${structure.file}. ` +
            'Suele indicar que no pudo leer los insumos; revisa el registro de actividad.';
          emit({ type: 'error', message: error });
          return { ok: false, error };
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
  // Modelo vacío = usar el modelo por defecto del CLI (no se inyecta --model;
  // pasar un ID inventado hace que el CLI lo descarte o falle).
  const withModel = Boolean(model && String(model).trim());

  // Si el comando es exactamente el binario de Antigravity sin más argumentos,
  // auto-completamos con las banderas de modelo, permisos y prompt por defecto.
  if (isAgy && parts.length === 1) {
    parts.push('--dangerously-skip-permissions');
    if (withModel) parts.push('--model', '{model}');
    parts.push('-p', '{prompt}');
  } else if (isAgy) {
    // Si tiene argumentos pero no bandera de modelo, la insertamos antes de -p o {prompt} si existen
    if (!hasModelFlag && withModel) {
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

  // Sin modelo: retirar cualquier par "--model {model}" que viniera escrito
  // en el comando configurado.
  if (!withModel) {
    const idx = parts.indexOf('{model}');
    if (idx !== -1) {
      const start = (idx > 0 && /^(-m|--model)$/.test(parts[idx - 1])) ? idx - 1 : idx;
      parts.splice(start, idx - start + 1);
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
    } else if (child.stdin) {
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
async function generate({ projectPath, structure, skillsSrcPath, userDataPath, safeStorage, convertCtx, onEvent }) {
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
  // Si la generación falla, el respaldo se restaura (no se pierde nada).
  const outFile = path.join(projectPath, 'generadas', structure.file);
  let backupPath = null;
  if (fs.existsSync(outFile)) {
    try {
      const backupDir = path.join(projectPath, '.geo', 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupName = structure.file.replace(/\.html?$/i, '') + `.${stamp}.html`;
      backupPath = path.join(backupDir, backupName);
      fs.copyFileSync(outFile, backupPath);
      fs.unlinkSync(outFile);
      emit({ type: 'status', message: `Versión anterior respaldada (.geo/backups/${backupName}); se regenera desde cero.` });
    } catch (err) {
      backupPath = null;
      emit({ type: 'status', message: `No se pudo respaldar la versión anterior: ${err && err.message}` });
    }
  }

  // Solo los insumos del segmento (AAA → momentos/introducción/línea de tiempo,
  // Introducción PDF → entregables, Rúbrica → glosario).
  const allInsumos = listInsumos(projectPath);
  const { files: insumoFiles, matched } = relevantInsumos(structure.skill, allInsumos);
  const useFiles = matched ? insumoFiles : allInsumos;
  if (matched) {
    emit({ type: 'status', message: `Insumos del segmento: ${insumoFiles.join(', ')}` });
  } else if (allInsumos.length) {
    emit({ type: 'status', message: 'Sin insumo específico para este segmento; se pasa la lista completa.' });
  }

  // Los agentes no pueden leer .docx/.pdf/.xlsx binarios (causa del clásico
  // "terminó sin escribir el archivo"): se convierten a texto antes.
  let insumoEntries = useFiles;
  if (useFiles.length && convertCtx) {
    emit({ type: 'status', message: 'Convirtiendo insumos a texto para el agente…' });
    try {
      const { extractInsumos } = require('./extract');
      const extracted = await extractInsumos(projectPath, useFiles, convertCtx, (m) =>
        emit({ type: 'status', message: m }));
      insumoEntries = extracted.entries;
      for (const w of extracted.warnings) {
        emit({ type: 'status', message: `⚠ No se pudo convertir ${w}` });
      }
    } catch (err) {
      emit({ type: 'status', message: `⚠ Conversión de insumos no disponible: ${err && err.message}` });
    }
  }

  const env = { ...process.env };
  const instruction = buildInstruction(structure, insumoEntries);
  emit({ type: 'status', message: `Generando ${structure.label} con ${selected.label}…` });

  /** Restaura el respaldo si el agente no dejó archivo nuevo. @param {{ok:boolean}} result */
  const restoreOnFailure = (result) => {
    if (!result.ok && backupPath && !fs.existsSync(outFile)) {
      try {
        fs.copyFileSync(backupPath, outFile);
        emit({ type: 'status', message: 'Se restauró la versión anterior desde el respaldo.' });
      } catch { /* el respaldo sigue en .geo/backups */ }
    }
    return result;
  };

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
    const result = await claudeGenerate({ sdk, projectPath, env, instruction, emit, structure, model: selected.model });
    return restoreOnFailure(result);
  }

  // CLI (Antigravity) — modelo vacío = el por defecto del CLI
  if (selected.model) {
    env.GEMINI_MODEL = selected.model;
    env.ANTIGRAVITY_MODEL = selected.model;
  }
  const result = await cliGenerate({ command: selected.command, projectPath, env, instruction, emit, structure, model: selected.model });
  return restoreOnFailure(result);
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
  login,
  logout,
  downloadAndInstallCli,
  // expuestos para tests y para main.js
  describeTool,
  parseCommand,
  findOnPath,
  preflightAgyAuth,
  invalidateAgyAuthCache,
  relevantInsumos,
  listInsumos,
};
