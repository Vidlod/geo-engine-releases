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
  config: { curso: 'Demo', momentos: 1, avances: 1, last_avance: 1, ids: {} },
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
    status: async () => ({ ok: true, data: { sdkAvailable: true, hasCredential: true, credentialSource: 'cli' } }),
    setToken: async () => ({ ok: true, data: { sdkAvailable: true, hasCredential: true, credentialSource: 'app' } }),
    clearToken: async () => ({ ok: true, data: { sdkAvailable: true, hasCredential: false, credentialSource: null } }),
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
await tick(); await tick();

console.log('— Proyecto abierto —');
check('nombre del curso', $('.course__name')?.textContent === 'Demo');
check('chip de Claude conectado', $('.course-chip--on')?.textContent.includes('Claude conectado'));
check('contador de insumos', $('#geo-course-insumos')?.textContent.includes('2'));
check('checklist con 2 estructuras', $$('.course-row').length === 2);

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
