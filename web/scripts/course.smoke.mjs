/**
 * Smoke test del flujo "Proyecto de curso" (escritorio) con jsdom.
 *
 * Simula window.electronAPI (preload) antes de cargar el bundle y verifica:
 * tarjeta en el inicio → estado vacío → abrir proyecto → checklist con
 * estados, FLAGS y botón Generar.
 *
 * Uso:  node scripts/course.smoke.mjs
 */
import { readdirSync } from 'node:fs';
process.chdir(new URL('..', import.meta.url).pathname);
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!DOCTYPE html><html><body>
     <div id="app"></div>
     <div class="toast-container" id="toast-container"></div>
   </body></html>`,
  { url: 'http://localhost:5001/', pretendToBeVisual: true }
);

for (const k of [
  'window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement',
  'HTMLButtonElement', 'HTMLSelectElement', 'Node', 'NodeFilter', 'FileReader',
  'requestAnimationFrame', 'getComputedStyle', 'CustomEvent', 'DOMParser',
  'localStorage', 'FormData', 'Blob', 'confirm',
  'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'InputEvent',
  'Element', 'Document', 'Text', 'Range', 'Selection', 'DataTransfer',
]) {
  if (dom.window[k] === undefined) continue;
  try {
    Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true });
  } catch { /* solo lectura */ }
}
globalThis.fetch = () => Promise.reject(new Error('sin red en smoke test'));

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`);
  if (!cond) failures++;
};
const tick = () => new Promise((r) => setTimeout(r, 20));

/* ── Mock del preload (electronAPI) ───────────────────────── */
const fakeProject = {
  path: '/tmp/Demo.geocurso',
  name: 'Demo',
  config: { curso: 'Demo', momentos: 1, avances: 1, ids: {} },
  insumos: ['AAA-demo.docx', 'Rubrica1.pdf'],
  generadas: ['momento-1.html'],
  fileMap: { 'rubrica1': 'Rubrica1.pdf' },
  structures: [
    { id: 'introduccion', label: 'Introducción al curso', skill: 'geo-introduccion', file: 'introduccion.html', status: 'lista', flags: [], corrections: [] },
    {
      id: 'momento-1', label: 'Momento Evaluativo 1', skill: 'geo-momento', file: 'momento-1.html', numero: 1,
      status: 'flags',
      flags: [{ type: 'dato-faltante', message: 'Falta el enlace del foro social' }],
      corrections: ['"Comprar" → "Comparar" (semana 3)'],
    },
  ],
};

// Estado multi-agente: Claude conectado (sesión CLI), Antigravity sin detectar
// hasta que se configure un comando (lo que lo vuelve disponible).
let agentSelected = 'claude';
let agAvailable = false;
let agCommand = 'antigravity';
let agModel = 'gemini-3-flash-medium';
const agentState = () => ({
  selected: agentSelected,
  agents: [
    { id: 'claude', label: 'Claude Code', kind: 'sdk', available: true, hasCredential: true, credentialSource: 'cli', account: 'david25geo@gmail.com', model: 'claude-sonnet-4-6' },
    { id: 'antigravity', label: 'Antigravity', kind: 'cli', available: agAvailable, hasCredential: agAvailable, credentialSource: agAvailable ? 'cli' : null, command: agCommand, model: agModel },
  ],
});

dom.window.electronAPI = {
  onUpdateAvailable: () => () => {},
  onUpdateDownloaded: () => () => {},
  onUpdateError: () => () => {},
  quitAndInstall: async () => {},
  getAppInfo: async () => ({ version: '1.9.0', platform: 'test', arch: 'x64', isDev: true }),
  openDirectory: async () => ({ canceled: false, filePaths: ['/tmp/Demo.geocurso'] }),
  openFile: async () => ({ canceled: true, filePaths: [] }),
  project: {
    open: async () => ({ ok: true, data: fakeProject }),
    create: async () => ({ ok: true, data: fakeProject }),
    saveConfig: async () => ({ ok: true, data: fakeProject }),
    importPlantilla: async () => ({ ok: true, data: fakeProject }),
    readGenerated: async () => ({ ok: true, data: { name: 'momento-1.html', html: '<p>generado</p>' } }),
    addInsumos: async () => ({ ok: true, data: fakeProject }),
  },
  agent: {
    status: async () => ({ ok: true, data: agentState() }),
    select: async (id) => { agentSelected = id; return { ok: true, data: agentState() }; },
    setToken: async () => ({ ok: true, data: agentState() }),
    clearToken: async () => ({ ok: true, data: agentState() }),
    setCommand: async (_id, command) => { agCommand = command; agAvailable = true; return { ok: true, data: agentState() }; },
    setModel: async (_id, model) => { agModel = model; return { ok: true, data: agentState() }; },
    generate: async () => ({ ok: true, data: { ok: true, file: 'momento-1.html' } }),
    onEvent: () => () => {},
  },
};

const bundle = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
await import(`../dist/assets/${bundle}`);

const $ = (sel) => dom.window.document.querySelector(sel);
const $$ = (sel) => [...dom.window.document.querySelectorAll(sel)];

console.log('— Inicio (escritorio) —');
check('tarjeta Proyecto de curso visible', !!$('#geo-home-course'));
check('grid de 3 tarjetas', $('.home__cards').classList.contains('home__cards--three'));

console.log('— Estado vacío del proyecto —');
$('#geo-home-course').click();
await tick();
check('vista course visible', !$('#geo-course-screen').classList.contains('hidden'));
check('acciones crear/abrir/importar', !!$('#geo-course-new') && !!$('#geo-course-open') && !!$('#geo-course-import'));

console.log('— Crear curso (modal propio, sin window.prompt) —');
$('#geo-course-new').click();
await tick();
check('modal de nombre abre', !!$('#geo-course-modal'));
check('botón Crear deshabilitado sin texto', $('#geo-course-modal-ok')?.disabled === true);
$('#geo-course-modal-cancel').click();
await new Promise((r) => setTimeout(r, 220));
check('cancelar cierra el modal sin crear', !$('#geo-course-modal') && !!$('#geo-course-new'));

$('#geo-course-new').click();
await tick();
const nameInput = $('#geo-course-modal-input');
nameInput.value = 'Demo';
nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
check('botón Crear se habilita al escribir', $('#geo-course-modal-ok').disabled === false);
$('#geo-course-modal-ok').click();
await new Promise((r) => setTimeout(r, 220)); // dejar que el modal se desmonte (180 ms)

console.log('— Proyecto abierto —');
check('nombre del curso', $('.course__name')?.textContent === 'Demo');
check('contador de insumos', $('#geo-course-insumos')?.textContent.includes('2'));
check('checklist con 2 estructuras', $$('.course-row').length === 2);
check('sin campo Último avance', !$('#geo-course-last'));
check('nota de Producto Final', !!$('.course__field-note'));

console.log('— Selector de agentes (Claude / Antigravity) —');
check('dos tiles de agente', $$('.agent-tile').length === 2);
check('Claude es el activo', $('.agent-tile--claude').classList.contains('agent-tile--active'));
check('LED de Claude encendido', !!$('.agent-tile--claude .agent-tile__led--on'));
check('Antigravity detectable como CLI no detectado',
  $('.agent-tile--antigravity .agent-tile__status')?.textContent.includes('no detectado'));
check('acción Claude: conectado vía sesión', $('#geo-agent-action')?.textContent.includes('Conectado'));
check('Claude muestra el email de la cuenta', $('.agent-tile--claude').textContent.includes('david25geo@gmail.com'));
check('selector de modelo de Claude presente', !!$('#geo-agent-model-select'));
check('Claude ofrece Sonnet 4.6 como recomendado',
  [...$('#geo-agent-model-select').options].some((o) => o.value === 'claude-sonnet-4-6' && /Recomendado/.test(o.textContent)));
check('Sonnet 4.6 es el modelo activo de Claude', $('#geo-agent-model-select').value === 'claude-sonnet-4-6');

// Cambiar a Antigravity (aún no configurado → no disponible)
$('.agent-tile--antigravity').click();
await tick();
check('Antigravity pasa a activo', $('.agent-tile--antigravity').classList.contains('agent-tile--active'));
check('acción muestra el comando configurable', !!$('#geo-agent-command') && $('#geo-agent-action').textContent.includes('antigravity'));
check('Generar oculto mientras Antigravity no está disponible',
  !$('.course-row[data-id="momento-1"] [data-act="generate"]'));

console.log('— Configurar comando de Antigravity → modelo Gemini 3 —');
$('#geo-agent-command').click();
await tick();
const cmdInput = $('#geo-course-modal-input');
cmdInput.value = 'antigravity';
cmdInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('#geo-course-modal-ok').click();
await new Promise((r) => setTimeout(r, 220)); // desmontaje del modal
check('Antigravity disponible tras configurar comando',
  $('.agent-tile--antigravity .agent-tile__led--on') !== null || $('.agent-tile--antigravity .agent-tile__led--warn') !== null);
const agSelect = $('#geo-agent-model-select');
check('selector de modelo de Antigravity aparece', !!agSelect);
check('opción Gemini 3 Flash medium disponible',
  !!agSelect && [...agSelect.options].some((o) => o.value === 'gemini-3-flash-medium' && /Gemini 3 Flash/.test(o.textContent)));
check('Gemini 3 Flash medium es el modelo activo',
  !!agSelect && agSelect.value === 'gemini-3-flash-medium');

// Volver a Claude para el resto del flujo
$('.agent-tile--claude').click();
await tick();
check('Generar vuelve con Claude activo', !!$('.course-row[data-id="momento-1"] [data-act="generate"]'));

const momento = $('.course-row[data-id="momento-1"]');
check('momento-1 con punto de FLAGS', !!momento.querySelector('.course-row__dot--warn'));
check('botón Generar presente', !!momento.querySelector('[data-act="generate"]'));
check('botón FLAGS con conteo', momento.querySelector('[data-act="flags"]')?.textContent.includes('1'));

momento.querySelector('[data-act="flags"]').click();
check('detalle de FLAGS abre', !momento.querySelector('.course-row__detail').classList.contains('hidden'));
check('tarjeta de FLAG con tipo y mensaje',
  momento.querySelector('.course-flag__type')?.textContent === 'dato-faltante' &&
  momento.querySelector('.course-flag__msg')?.textContent.includes('foro social'));
check('correcciones de la IA listadas',
  momento.querySelector('.course-corrections')?.textContent.includes('Comparar'));

console.log('— Abrir generada en el editor —');
momento.querySelector('[data-act="open"]').click();
await tick();
check('editor visible con el HTML generado',
  !$('#geo-editor-layout').classList.contains('editor-layout--hidden'));

console.log(failures === 0 ? '\nCOURSE OK' : `\nCOURSE FALLÓ: ${failures} aserciones`);
process.exit(failures === 0 ? 0 : 1);
