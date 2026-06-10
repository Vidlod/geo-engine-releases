/**
 * Smoke test del bundle compilado (dist/) con jsdom.
 *
 * Verifica el flujo de vistas de la app fusionada sin navegador:
 *   inicio (2 modos) → asistente (rail de 4 pasos, secciones, prompt)
 *   inicio → editor directo (dropzone clásico)
 *
 * Uso:  node scripts/smoke.mjs
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

// Globals que el bundle espera del navegador
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
  } catch { /* propiedad de solo lectura del runtime: ignorar */ }
}
globalThis.fetch = () => Promise.reject(new Error('sin red en smoke test'));

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`);
  if (!cond) failures++;
};

const bundle = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
await import(`../dist/assets/${bundle}`);

const $ = (sel) => dom.window.document.querySelector(sel);
const $$ = (sel) => [...dom.window.document.querySelectorAll(sel)];

console.log('— Inicio —');
check('pantalla de inicio visible', $('#geo-home-screen') && !$('#geo-home-screen').classList.contains('hidden'));
check('tarjeta Asistente', !!$('#geo-home-wizard'));
check('tarjeta Editor directo', !!$('#geo-home-editor'));
check('editor oculto', $('#geo-editor-layout').classList.contains('editor-layout--hidden'));

console.log('— Asistente —');
$('#geo-home-wizard').click();
check('inicio oculto', $('#geo-home-screen').classList.contains('hidden'));
check('wizard visible', !$('#geo-wizard-screen').classList.contains('hidden'));
check('rail con 4 pasos', $$('.wizard__step').length === 4);
check('paso 1 activo', $('.wizard__step[data-step="1"]').classList.contains('wizard__step--active'));
check('pasos 2–4 bloqueados sin documentos',
  $$('.wizard__step--locked').length === 3);
check('mini-dropzone de documentos', !!$('.wizard__drop'));
check('botón Continuar deshabilitado', $('#geo-wizard-next')?.disabled === true);

console.log('— Asistente: flujo completo (conversión simulada) —');
// fetch falso: simula /api/convert exitoso
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    filename: 'AAA_demo.docx', engine: 'pandoc', format: 'markdown',
    content: '# SEMANA 7\n\nContenido de prueba del avance.', warnings: [],
  }),
});

const dropDoc = $('.wizard__drop');
const evDoc = new dom.window.Event('drop', { bubbles: true, cancelable: true });
Object.defineProperty(evDoc, 'dataTransfer', {
  value: { files: [new dom.window.File(['x'], 'AAA_demo.docx')] },
});
dropDoc.dispatchEvent(evDoc);
await new Promise((r) => setTimeout(r, 50));   // espera la conversión async

check('documento convertido en lista', $$('.wizard__file--done').length === 1);
check('Continuar habilitado tras convertir', $('#geo-wizard-next').disabled === false);

$('#geo-wizard-next').click();                  // → paso 2 (RED)
check('paso 2 activo', $('.wizard__step[data-step="2"]').classList.contains('wizard__step--active'));

const dropRed = $('.wizard__drop');
const evRed = new dom.window.Event('drop', { bubbles: true, cancelable: true });
Object.defineProperty(evRed, 'dataTransfer', {
  value: { files: [new dom.window.File(['x'], 'Mapa_Curso_Demo.pdf')] },
});
dropRed.dispatchEvent(evRed);
check('chip RED registrado', $$('.wizard__chip').length === 1);

$('#geo-wizard-next').click();                  // → paso 3 (prompt)
check('paso 3 activo', $('.wizard__step[data-step="3"]').classList.contains('wizard__step--active'));
check('4 tarjetas de sección', $$('.wizard__section').length === 4);
check('2 secciones habilitadas (momento, entregable)',
  $$('.wizard__section').filter((s) => !s.disabled).length === 2);

const prompt = $('#geo-wizard-promptpre').textContent;
check('prompt contiene el genérico', prompt.includes('PARTE 1'));
check('prompt contiene el esqueleto', prompt.includes('ESQUELETO HTML REAL'));
check('prompt contiene INSUMOS', prompt.includes('INSUMOS DE ESTA SOLICITUD'));
check('prompt contiene el RED', prompt.includes('Mapa_Curso_Demo.pdf'));
check('prompt contiene el documento', prompt.includes('SEMANA 7'));
check('prompt indica Momento Evaluativo 1', prompt.includes('Momento Evaluativo 1'));
check('centinela de integridad al final',
  prompt.trimEnd().endsWith('Esa línea le permite al usuario detectar de inmediato si algo se perdió.'));
check('línea de control con conteos',
  prompt.includes('INSUMOS RECIBIDOS: 1 documento(s) fuente · 1 archivo(s) RED'));
check('botón Descargar .md presente', !!$('#geo-wizard-dl'));
check('aviso de prompt largo oculto (prompt corto)',
  $('#geo-wizard-prompttip').classList.contains('hidden'));

$('.wizard__num[data-num="2"]').click();        // cambiar a Momento 2
check('número 2 actualiza el prompt',
  $('#geo-wizard-promptpre').textContent.includes('Momento Evaluativo 2'));

console.log('— Copiar por partes —');
const copied = [];
Object.defineProperty(dom.window.navigator, 'clipboard', {
  value: { writeText: async (t) => { copied.push(t); } },
  configurable: true,
});
const partsBtn = $('#geo-wizard-copyparts');
const partsLabel = $('#geo-wizard-copyparts-label');
check('etiqueta inicial con total de partes', partsLabel.textContent === 'Copiar por partes (3)');
partsBtn.click(); await new Promise((r) => setTimeout(r, 10));
check('tras parte 1, ofrece la 2', partsLabel.textContent === 'Copiar parte 2/3');
partsBtn.click(); await new Promise((r) => setTimeout(r, 10));
partsBtn.click(); await new Promise((r) => setTimeout(r, 10));
check('3 partes copiadas', copied.length === 3);
check('parte 1: reglas + orden de espera',
  copied[0].includes('PARTE 1/3') && copied[0].includes('REGLA DE ORO') &&
  copied[0].includes('NO GENERES TODAVÍA'));
check('parte 2: documento fuente',
  copied[1].includes('PARTE 2/3') && copied[1].includes('SEMANA 7'));
check('parte 3: insumos + GENERA AHORA',
  copied[2].includes('GENERA AHORA') && copied[2].includes('Mapa_Curso_Demo.pdf') &&
  copied[2].includes('Momento Evaluativo 2'));
check('etiqueta reinicia tras la última', partsLabel.textContent === 'Copiar por partes (3)');

$('#geo-wizard-next').click();                  // → paso 4 (resultado)
const ta4 = $('#geo-wizard-out-html');
check('paso 4 con textarea de resultado', !!ta4);
check('nombre sugerido según sección', $('#geo-wizard-out-name').value.includes('Momento'));
ta4.value = '<p>Resultado de la IA.</p>';
ta4.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('#geo-wizard-next').click();                  // → editor
check('HTML del asistente cargó en el editor',
  !$('#geo-editor-layout').classList.contains('editor-layout--hidden'));

console.log('— Editor directo —');
$('#geo-btn-reset').click();                    // nuevo archivo → inicio
check('reset vuelve al inicio', !$('#geo-home-screen').classList.contains('hidden'));
$('#geo-home-editor').click();
check('dropzone visible', !$('#geo-dropzone-screen').classList.contains('hidden'));
check('dropzone clásico montado', !!$('#geo-dropzone'));
check('botón volver presente', !!$('.dropzone-view__back'));
check('botón pegar HTML presente', !!$('#geo-paste-btn'));

console.log('— Carga de HTML → editor + linter —');
// Cargar HTML directamente por la vía del modal de pegado
$('#geo-paste-btn').click();
const ta = $('#geo-paste-textarea');
check('modal de pegado abre', !!ta);
ta.value = '<p>Hola <i>curso</i> del módulo.</p><br><br><p>Fin.</p>';
ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('#geo-paste-load').click();
check('editor visible tras cargar', !$('#geo-editor-layout').classList.contains('editor-layout--hidden'));
check('linter detectó problemas', $$('.finding-card').length > 0);

console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FALLÓ: ${failures} aserciones`);
process.exit(failures === 0 ? 0 : 1);
