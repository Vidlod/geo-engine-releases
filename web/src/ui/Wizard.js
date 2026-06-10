/**
 * @fileoverview GEO Engine — Asistente de curso (wizard de 4 pasos).
 *
 * Pipeline completo del flujo GEO:
 *   01 · Documentos  — sube .docx/.pdf y los convierte (Pandoc / PyMuPDF4LLM / mammoth)
 *   02 · Archivos RED — registra los NOMBRES de los RED (no se suben)
 *   03 · Prompt       — elige la sección y copia el prompt genérico + insumos
 *   04 · Resultado    — pega el HTML que devolvió la IA y pasa al editor/linter
 *
 * @module ui/Wizard
 */

import { convertFile, ENGINE_LABELS } from '../wizard/convertApi.js';
import { SECTIONS, buildPrompt, buildPromptParts, estimateTokens } from '../wizard/promptBuilder.js';
import { showToast } from './Toast.js';

/* ── Iconos ─────────────────────────────────────────────────── */
const I = {
  doc: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  box: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  spark: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/></svg>`,
  code: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  back: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

const STEPS = [
  { id: 1, code: '01', label: 'Documentos',   hint: 'Word y PDF → Markdown' },
  { id: 2, code: '02', label: 'Archivos RED', hint: 'Nombres para @@PLUGINFILE@@' },
  { id: 3, code: '03', label: 'Prompt',       hint: 'Sección + genérico' },
  { id: 4, code: '04', label: 'Resultado',    hint: 'HTML de la IA → editor' },
];

export class Wizard {
  /**
   * @param {HTMLElement} containerEl
   * @param {Object} callbacks
   * @param {(filename: string, html: string) => void} callbacks.onLoadHtml
   * @param {() => void} callbacks.onBack
   */
  constructor(containerEl, callbacks) {
    /** @private */ this._container = containerEl;
    /** @private */ this._cb = callbacks;

    /** @private */ this._step = 1;

    /**
     * @private
     * @type {Array<{file: File, engine: string, status: string,
     *               result: import('../wizard/convertApi.js').ConvertResult|null,
     *               error: string}>}
     */
    this._docs = [];

    /** @private @type {string[]} */
    this._redFiles = [];

    /** @private */ this._sectionId = 'momento';
    /** @private */ this._number = 1;
    /** @private */ this._prompt = '';
    /** @private @type {string[]} */ this._parts = [];
    /** @private */ this._partIdx = 0;
  }

  /* ── Render raíz ─────────────────────────────────────────── */

  render() {
    this._container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'wizard';

    // ── Rail de pasos ──
    const rail = document.createElement('aside');
    rail.className = 'wizard__rail';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn--ghost wizard__back';
    backBtn.innerHTML = `${I.back} <span>Inicio</span>`;
    backBtn.addEventListener('click', () => this._cb.onBack());
    rail.appendChild(backBtn);

    const steps = document.createElement('ol');
    steps.className = 'wizard__steps';
    STEPS.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'wizard__step';
      li.dataset.step = String(s.id);
      li.innerHTML = `
        <span class="wizard__step-dot"><span class="wizard__step-code">${s.code}</span></span>
        <span class="wizard__step-text">
          <span class="wizard__step-label">${s.label}</span>
          <span class="wizard__step-hint">${s.hint}</span>
        </span>`;
      li.addEventListener('click', () => {
        if (s.id < this._step || this._canEnter(s.id)) this._goTo(s.id);
      });
      steps.appendChild(li);
    });
    rail.appendChild(steps);

    // ── Panel de contenido ──
    const panel = document.createElement('div');
    panel.className = 'wizard__panel';
    panel.id = 'geo-wizard-panel';
    this._panel = panel;

    wrap.append(rail, panel);
    this._container.appendChild(wrap);
    this._rail = steps;

    this._goTo(this._step);
  }

  /* ── Navegación ──────────────────────────────────────────── */

  /** @private ¿Puede entrar al paso `n` con el estado actual? */
  _canEnter(n) {
    if (n <= 1) return true;
    const converted = this._docs.some((d) => d.status === 'done');
    if (n === 2) return converted;
    if (n === 3) return converted;
    if (n === 4) return converted && !!this._prompt;
    return false;
  }

  /** @private */
  _goTo(n) {
    this._step = n;

    // Estado visual del rail
    this._rail.querySelectorAll('.wizard__step').forEach((el) => {
      const id = Number(el.dataset.step);
      el.classList.toggle('wizard__step--active', id === n);
      el.classList.toggle('wizard__step--done', id < n);
      el.classList.toggle('wizard__step--locked', id > n && !this._canEnter(id));
    });
    this._rail.style.setProperty('--progress', String((n - 1) / (STEPS.length - 1)));

    this._panel.innerHTML = '';
    if (n === 1) this._renderStepDocs();
    if (n === 2) this._renderStepRed();
    if (n === 3) this._renderStepPrompt();
    if (n === 4) this._renderStepResult();
  }

  /** @private Pie de navegación común. */
  _footer({ nextLabel = 'Continuar', nextEnabled = true, onNext = null, note = '' } = {}) {
    const foot = document.createElement('div');
    foot.className = 'wizard__footer';

    if (note) {
      const n = document.createElement('span');
      n.className = 'wizard__footer-note';
      n.textContent = note;
      foot.appendChild(n);
    }

    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    foot.appendChild(spacer);

    if (this._step > 1) {
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn btn--ghost';
      prev.textContent = 'Atrás';
      prev.addEventListener('click', () => this._goTo(this._step - 1));
      foot.appendChild(prev);
    }

    if (onNext) {
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn btn--primary';
      next.disabled = !nextEnabled;
      next.textContent = nextLabel;
      next.id = 'geo-wizard-next';
      next.addEventListener('click', onNext);
      foot.appendChild(next);
    }

    return foot;
  }

  /** @private */
  _head(title, sub) {
    const h = document.createElement('header');
    h.className = 'wizard__head';
    h.innerHTML = `<h2 class="wizard__title">${title}</h2>
                   <p class="wizard__subtitle">${sub}</p>`;
    return h;
  }

  /* ════════════════════════════════════════════════════════════
     Paso 1 — Documentos fuente
     ════════════════════════════════════════════════════════════ */

  /** @private */
  _renderStepDocs() {
    const p = this._panel;
    p.append(this._head(
      'Documentos fuente',
      'Sube la AAA (.docx) y los PDF de instrucciones. Se convierten a Markdown ' +
      'para que la IA lea la estructura real: títulos, tablas y columnas.'
    ));

    // Drop mini-zone
    const drop = document.createElement('div');
    drop.className = 'wizard__drop';
    drop.innerHTML = `${I.doc}<span><strong>Arrastra .docx o .pdf</strong> o haz clic para seleccionar</span>
                      <span class="dropzone__badge">.docx → Pandoc · .pdf → PyMuPDF4LLM</span>`;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx,.pdf';
    input.multiple = true;
    input.className = 'sr-only';

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('wizard__drop--active'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('wizard__drop--active'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('wizard__drop--active');
      this._addDocs(Array.from(e.dataTransfer?.files || []));
    });
    input.addEventListener('change', () => {
      this._addDocs(Array.from(input.files || []));
      input.value = '';
    });

    // Lista de archivos
    const list = document.createElement('div');
    list.className = 'wizard__files';
    list.id = 'geo-wizard-doclist';
    this._docList = list;

    p.append(drop, input, list);
    this._renderDocList();

    p.appendChild(this._footer({
      nextEnabled: this._docs.some((d) => d.status === 'done'),
      onNext: () => this._goTo(2),
      note: this._docs.length === 0 ? 'Necesitas al menos un documento convertido.' : '',
    }));
  }

  /** @private */
  _addDocs(files) {
    const valid = files.filter((f) => /\.(docx|pdf)$/i.test(f.name));
    if (valid.length === 0) {
      showToast('Solo se aceptan archivos .docx o .pdf', 'error');
      return;
    }
    for (const file of valid) {
      if (this._docs.some((d) => d.file.name === file.name)) continue;
      const entry = {
        file,
        engine: file.name.toLowerCase().endsWith('.pdf') ? 'pymupdf4llm' : 'pandoc',
        status: 'converting',
        result: null,
        error: '',
      };
      this._docs.push(entry);
      this._convert(entry);
    }
    this._renderDocList();
  }

  /** @private */
  async _convert(entry) {
    entry.status = 'converting';
    entry.error = '';
    this._renderDocList();
    try {
      entry.result = await convertFile(entry.file, entry.engine);
      entry.engine = entry.result.engine;
      entry.status = 'done';
    } catch (err) {
      entry.status = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
    }
    this._renderDocList();
    this._refreshNext(this._docs.some((d) => d.status === 'done'));
  }

  /** @private */
  _refreshNext(enabled) {
    const btn = document.getElementById('geo-wizard-next');
    if (btn) /** @type {HTMLButtonElement} */ (btn).disabled = !enabled;
  }

  /** @private */
  _renderDocList() {
    const list = this._docList;
    if (!list || !list.isConnected) return;
    list.innerHTML = '';

    this._docs.forEach((d, idx) => {
      const row = document.createElement('div');
      row.className = `wizard__file wizard__file--${d.status}`;

      const isDocx = d.file.name.toLowerCase().endsWith('.docx');
      const engineSel = isDocx
        ? `<select class="wizard__engine" data-idx="${idx}" ${d.status === 'converting' ? 'disabled' : ''}>
             <option value="pandoc" ${d.engine === 'pandoc' ? 'selected' : ''}>Pandoc → Markdown</option>
             <option value="mammoth" ${d.engine === 'mammoth' ? 'selected' : ''}>mammoth → HTML (1:1)</option>
           </select>`
        : `<span class="wizard__engine wizard__engine--fixed">${ENGINE_LABELS.pymupdf4llm}</span>`;

      const status =
        d.status === 'converting' ? '<span class="wizard__spinner"></span>' :
        d.status === 'done'       ? `<span class="wizard__file-ok">${I.check}</span>` :
                                    `<span class="wizard__file-err" title="${d.error}">✕</span>`;

      row.innerHTML = `
        <span class="wizard__file-icon">${I.doc}</span>
        <span class="wizard__file-name" title="${d.file.name}">${d.file.name}</span>
        ${engineSel}
        ${status}
        <button type="button" class="wizard__file-remove" data-remove="${idx}" title="Quitar">${I.trash}</button>`;

      if (d.status === 'error') {
        const err = document.createElement('div');
        err.className = 'wizard__file-error-msg';
        err.textContent = d.error;
        row.appendChild(err);
      }
      if (d.status === 'done' && d.result) {
        const peek = document.createElement('details');
        peek.className = 'wizard__peek';
        const chars = d.result.content.length.toLocaleString('es-CO');
        peek.innerHTML = `<summary>Vista previa · ${chars} caracteres · ${d.result.format}</summary>
                          <pre class="wizard__peek-pre"></pre>`;
        peek.querySelector('pre').textContent =
          d.result.content.slice(0, 4000) + (d.result.content.length > 4000 ? '\n…' : '');
        row.appendChild(peek);
      }
      list.appendChild(row);
    });

    // wiring
    list.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._docs.splice(Number(btn.getAttribute('data-remove')), 1);
        this._renderDocList();
        this._refreshNext(this._docs.some((d) => d.status === 'done'));
      });
    });
    list.querySelectorAll('select.wizard__engine').forEach((sel) => {
      sel.addEventListener('change', () => {
        const entry = this._docs[Number(sel.getAttribute('data-idx'))];
        entry.engine = /** @type {HTMLSelectElement} */ (sel).value;
        this._convert(entry);
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     Paso 2 — Archivos RED
     ════════════════════════════════════════════════════════════ */

  /** @private */
  _renderStepRed() {
    const p = this._panel;
    p.append(this._head(
      'Archivos RED del curso',
      'Selecciona TODOS los Recursos Educativos Digitales. Solo se registran ' +
      'los nombres — los archivos no se suben — para que la IA escriba los ' +
      'enlaces <code>@@PLUGINFILE@@</code> con el nombre exacto.'
    ));

    const drop = document.createElement('div');
    drop.className = 'wizard__drop';
    drop.innerHTML = `${I.box}<span><strong>Arrastra los archivos RED</strong> o haz clic para seleccionar</span>
                      <span class="dropzone__badge">pdf · pptx · mp4 · cualquier extensión</span>`;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.className = 'sr-only';

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('wizard__drop--active'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('wizard__drop--active'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('wizard__drop--active');
      this._addRed(Array.from(e.dataTransfer?.files || []).map((f) => f.name));
    });
    input.addEventListener('change', () => {
      this._addRed(Array.from(input.files || []).map((f) => f.name));
      input.value = '';
    });

    const chips = document.createElement('div');
    chips.className = 'wizard__chips';
    chips.id = 'geo-wizard-redchips';
    this._redChips = chips;

    p.append(drop, input, chips);
    this._renderRedChips();

    p.appendChild(this._footer({
      onNext: () => this._goTo(3),
      note: 'Puedes continuar sin RED: la IA dejará FLAGs `red-sin-archivo`.',
    }));
  }

  /** @private */
  _addRed(names) {
    for (const n of names) {
      if (n && !this._redFiles.includes(n)) this._redFiles.push(n);
    }
    this._renderRedChips();
  }

  /** @private */
  _renderRedChips() {
    const box = this._redChips;
    if (!box || !box.isConnected) return;
    box.innerHTML = '';

    if (this._redFiles.length === 0) {
      box.innerHTML = '<p class="wizard__empty">Sin archivos RED registrados.</p>';
      return;
    }

    const count = document.createElement('p');
    count.className = 'wizard__chips-count';
    count.textContent = `${this._redFiles.length} archivo(s)`;
    box.appendChild(count);

    this._redFiles.forEach((name, idx) => {
      const chip = document.createElement('span');
      chip.className = 'wizard__chip';
      chip.innerHTML = `<code>${name}</code><button type="button" title="Quitar" data-idx="${idx}">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        this._redFiles.splice(idx, 1);
        this._renderRedChips();
      });
      box.appendChild(chip);
    });
  }

  /* ════════════════════════════════════════════════════════════
     Paso 3 — Sección y prompt
     ════════════════════════════════════════════════════════════ */

  /** @private */
  _renderStepPrompt() {
    const p = this._panel;
    p.append(this._head(
      'Sección y prompt',
      'Elige qué vas a maquetar. El prompt genérico de esa sección se combina ' +
      'con tus documentos y la lista de RED — listo para pegar en la IA.'
    ));

    // ── Tarjetas de sección ──
    const grid = document.createElement('div');
    grid.className = 'wizard__sections';

    SECTIONS.forEach((s) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'wizard__section';
      card.disabled = !s.available;
      card.dataset.section = s.id;
      card.innerHTML = `
        <span class="wizard__section-label">${s.label}</span>
        <span class="wizard__section-desc">${s.desc}</span>
        ${s.available ? '' : '<span class="wizard__section-soon">genérico pendiente</span>'}`;
      card.addEventListener('click', () => {
        this._sectionId = s.id;
        this._syncPrompt();
      });
      grid.appendChild(card);
    });
    p.appendChild(grid);

    // ── Selector de número ──
    const numRow = document.createElement('div');
    numRow.className = 'wizard__numrow';
    numRow.id = 'geo-wizard-numrow';
    numRow.innerHTML = '<span class="wizard__numrow-label">Número:</span>';
    for (let n = 1; n <= 5; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wizard__num';
      b.dataset.num = String(n);
      b.textContent = String(n);
      b.addEventListener('click', () => {
        this._number = n;
        this._syncPrompt();
      });
      numRow.appendChild(b);
    }
    p.appendChild(numRow);

    // ── Vista previa del prompt ──
    const preview = document.createElement('div');
    preview.className = 'wizard__prompt';
    preview.innerHTML = `
      <div class="wizard__prompt-bar">
        <span class="wizard__prompt-stats" id="geo-wizard-promptstats"></span>
        <button type="button" class="btn btn--ghost" id="geo-wizard-dl">${I.download} <span>Descargar .md</span></button>
        <button type="button" class="btn btn--ghost" id="geo-wizard-copyparts">${I.copy} <span id="geo-wizard-copyparts-label">Copiar por partes</span></button>
        <button type="button" class="btn btn--primary" id="geo-wizard-copy">${I.copy} <span>Copiar prompt</span></button>
      </div>
      <div class="wizard__prompt-tip hidden" id="geo-wizard-prompttip">
        Prompt largo: usa <strong>Copiar por partes</strong> (mensajes de tamaño seguro,
        la IA confirma cada parte y genera solo al final) o <strong>Descargar .md</strong>
        para Claude, que sí ingiere adjuntos completos. ChatGPT lee los adjuntos por
        fragmentos: con archivos grandes prefiere las partes.
      </div>
      <pre class="wizard__prompt-pre" id="geo-wizard-promptpre"></pre>`;
    p.appendChild(preview);

    preview.querySelector('#geo-wizard-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this._prompt);
        showToast('Prompt copiado — pégalo en Claude, ChatGPT o Gemini', 'success');
      } catch {
        showToast('No se pudo copiar al portapapeles', 'error');
      }
    });

    preview.querySelector('#geo-wizard-copyparts').addEventListener('click', async () => {
      if (this._parts.length === 0) return;
      const i = this._partIdx;
      try {
        await navigator.clipboard.writeText(this._parts[i]);
      } catch {
        showToast('No se pudo copiar al portapapeles', 'error');
        return;
      }
      if (i + 1 < this._parts.length) {
        this._partIdx = i + 1;
        showToast(
          `Parte ${i + 1}/${this._parts.length} copiada — pégala, espera ` +
          `«recibida» y vuelve por la siguiente`, 'success'
        );
      } else {
        this._partIdx = 0;
        showToast(
          `Parte ${i + 1}/${this._parts.length} copiada (final) — la IA genera ahora`,
          'success'
        );
      }
      this._syncPartsLabel();
    });

    preview.querySelector('#geo-wizard-dl').addEventListener('click', () => {
      const section = SECTIONS.find((s) => s.id === this._sectionId);
      const name = 'prompt_' +
        (section ? section.label.replace(/\s+/g, '_') : 'seccion') +
        (section?.hasNumber ? '_' + this._number : '') + '.md';
      const blob = new Blob([this._prompt], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Descargado ${name} — adjúntalo en el chat de la IA`, 'success');
    });

    p.appendChild(this._footer({
      nextLabel: 'Ya tengo el HTML →',
      onNext: () => this._goTo(4),
    }));

    this._syncPrompt();
  }

  /** @private Reconstruye el prompt y refresca la UI del paso 3. */
  _syncPrompt() {
    const section = SECTIONS.find((s) => s.id === this._sectionId && s.available)
      || SECTIONS.find((s) => s.available);
    if (!section) return;
    this._sectionId = section.id;

    // marcar tarjeta activa
    this._panel.querySelectorAll('.wizard__section').forEach((el) => {
      el.classList.toggle('wizard__section--active', el.dataset.section === section.id);
    });

    // número visible solo si aplica
    const numRow = this._panel.querySelector('#geo-wizard-numrow');
    if (numRow) {
      numRow.classList.toggle('hidden', !section.hasNumber);
      numRow.querySelectorAll('.wizard__num').forEach((el) => {
        el.classList.toggle('wizard__num--active', Number(el.dataset.num) === this._number);
      });
    }

    const docs = this._docs.filter((d) => d.status === 'done').map((d) => d.result);
    const inputs = {
      section,
      number: section.hasNumber ? this._number : null,
      redFiles: this._redFiles,
      docs,
    };
    this._prompt = buildPrompt(inputs);
    this._parts = buildPromptParts(inputs);
    this._partIdx = 0;   // cambiar sección/número reinicia la secuencia
    this._syncPartsLabel();

    const pre = this._panel.querySelector('#geo-wizard-promptpre');
    const stats = this._panel.querySelector('#geo-wizard-promptstats');
    const tip = this._panel.querySelector('#geo-wizard-prompttip');
    if (pre) pre.textContent = this._prompt;
    if (stats) {
      stats.textContent =
        `${this._prompt.length.toLocaleString('es-CO')} caracteres · ` +
        `≈ ${estimateTokens(this._prompt).toLocaleString('es-CO')} tokens · ` +
        `${docs.length} documento(s) · ${this._redFiles.length} RED`;
    }
    // Pegados muy largos corren riesgo de truncado silencioso en algunas UIs.
    if (tip) tip.classList.toggle('hidden', this._prompt.length <= 60000);
  }

  /** @private Refresca la etiqueta del botón "Copiar por partes". */
  _syncPartsLabel() {
    const label = this._panel.querySelector('#geo-wizard-copyparts-label');
    if (!label) return;
    const n = this._parts.length;
    label.textContent = this._partIdx === 0
      ? `Copiar por partes (${n})`
      : `Copiar parte ${this._partIdx + 1}/${n}`;
  }

  /* ════════════════════════════════════════════════════════════
     Paso 4 — Resultado de la IA
     ════════════════════════════════════════════════════════════ */

  /** @private */
  _renderStepResult() {
    const p = this._panel;
    p.append(this._head(
      'Resultado de la IA',
      'Pega aquí el HTML que devolvió la IA. Se carga en el editor con el ' +
      'linter activo para revisarlo y corregirlo.'
    ));

    const nameRow = document.createElement('div');
    nameRow.className = 'paste-modal__filename-row';
    nameRow.innerHTML = `<label class="paste-modal__label" for="geo-wizard-out-name">Nombre del archivo</label>`;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'paste-modal__filename-input';
    nameInput.id = 'geo-wizard-out-name';
    nameInput.spellcheck = false;

    const section = SECTIONS.find((s) => s.id === this._sectionId);
    nameInput.value = section
      ? `${section.label.replace(/\s+/g, '_')}${section.hasNumber ? '_' + this._number : ''}.html`
      : 'resultado.html';
    nameRow.appendChild(nameInput);

    const taLabel = document.createElement('label');
    taLabel.className = 'paste-modal__label';
    taLabel.htmlFor = 'geo-wizard-out-html';
    taLabel.textContent = 'Código HTML';

    const ta = document.createElement('textarea');
    ta.className = 'paste-modal__textarea wizard__result-ta';
    ta.id = 'geo-wizard-out-html';
    ta.placeholder = 'Pega aquí el HTML generado por la IA…';
    ta.spellcheck = false;

    const count = document.createElement('div');
    count.className = 'paste-modal__charcount';
    count.textContent = '0 caracteres';

    ta.addEventListener('input', () => {
      count.textContent = ta.value.length.toLocaleString('es-CO') + ' caracteres';
      this._refreshNext(ta.value.trim().length > 0);
    });

    p.append(nameRow, taLabel, ta, count);

    p.appendChild(this._footer({
      nextLabel: 'Cargar en el editor',
      nextEnabled: false,
      onNext: () => {
        const html = ta.value.trim();
        if (!html) return;
        let name = nameInput.value.trim() || 'resultado.html';
        if (!/\.html?$/.test(name)) name += '.html';
        this._cb.onLoadHtml(name, html);
      },
    }));
  }
}
