/**
 * @fileoverview GEO Engine — Main application entry point.
 *
 * Bootstraps the app shell, wires all components (Engine, Preview,
 * Dropzone, Toolbar, LinterPanel, Toast), and coordinates their
 * interactions.
 *
 * @module main
 */

/* ── Style imports (handled by Vite) ────────────────────── */
import './styles/index.css';
import './styles/editor.css';
import './styles/moodle.css';

/* ── Core modules ───────────────────────────────────────── */
import { Engine } from './editor/Engine.js';
import { Preview } from './editor/Preview.js';
import { Dropzone } from './ui/Dropzone.js';
import { Toolbar } from './ui/Toolbar.js';
import { LinterPanel } from './ui/LinterPanel.js';
import { showToast } from './ui/Toast.js';

import { Linter } from './linter/index.js';

/* ── Default linter configuration ───────────────────────── */
const DEFAULT_LINTER_CONFIG = {
  rules: {
    'max-br':              { enabled: true, max: 2 },
    'br-before-close':     { enabled: true },
    'br-between-blocks':   { enabled: true },
    'br-before-button':    { enabled: true },
    'max-spaces':          { enabled: true, max: 2 },
    'terminology-module':  { enabled: true },
    'emoticon-span':       { enabled: true },
    'link-target':         { enabled: true },
    'elibro-proxy':        { enabled: true },
    'tablero-anotaciones': { enabled: true },
    'no-italics':          { enabled: true },
    'li-paragraph':        { enabled: true },
    'li-period':           { enabled: true },
    'producto-final':      { enabled: true },
  },
  course: { last_avance: 5 },
};

/* ═══════════════════════════════════════════════════════════ */
/*  App                                                       */
/* ═══════════════════════════════════════════════════════════ */

class App {
  constructor() {
    /** @type {Engine} */
    this.engine = new Engine();

    /** @type {InstanceType<typeof Linter>} */
    this.linter = new Linter(DEFAULT_LINTER_CONFIG);

    /** @type {string} Current loaded filename */
    this.filename = '';

    // Component references (assigned in init)
    /** @type {Toolbar} */    this.toolbar = /** @type {any} */ (null);
    /** @type {Dropzone} */   this.dropzone = /** @type {any} */ (null);
    /** @type {Preview} */    this.preview = /** @type {any} */ (null);
    /** @type {LinterPanel} */this.linterPanel = /** @type {any} */ (null);

    // DOM references
    /** @type {HTMLElement} */ this._dropzoneScreen = /** @type {any} */ (null);
    /** @type {HTMLElement} */ this._editorLayout = /** @type {any} */ (null);

    this._init();
  }

  /* ── Bootstrap ───────────────────────────────────────────── */

  /** @private */
  _init() {
    const app = document.getElementById('app');
    if (!app) {
      throw new Error('#app element not found');
    }

    // ── Build the app shell ──────────────────────────────────
    //  <header.toolbar>
    //  <main.main>
    //    <section.dropzone-screen> (visible at start)
    //    <section.editor-layout.editor-layout--hidden>
    //      <div.preview-panel>
    //      <aside.linter-sidebar>
    //    </section>
    //  </main>
    //  <footer.status-bar>

    // Toolbar
    const toolbarEl = document.createElement('header');
    toolbarEl.id = 'geo-toolbar-root';

    // Main area
    const main = document.createElement('main');
    main.className = 'main';

    // Dropzone screen
    const dropzoneScreen = document.createElement('section');
    dropzoneScreen.className = 'dropzone-screen';
    dropzoneScreen.id = 'geo-dropzone-screen';
    this._dropzoneScreen = dropzoneScreen;

    // Editor layout
    const editorLayout = document.createElement('section');
    editorLayout.className = 'editor-layout editor-layout--hidden';
    editorLayout.id = 'geo-editor-layout';
    this._editorLayout = editorLayout;

    const previewPanel = document.createElement('div');
    previewPanel.className = 'preview-panel';
    previewPanel.id = 'geo-preview-panel';

    const linterSidebar = document.createElement('aside');
    linterSidebar.id = 'geo-linter-sidebar-root';

    editorLayout.append(previewPanel, linterSidebar);
    main.append(dropzoneScreen, editorLayout);

    // Status bar
    const statusBar = document.createElement('footer');
    statusBar.className = 'status-bar';
    statusBar.id = 'geo-status-bar';
    statusBar.innerHTML = `
      <div class="status-bar__item">
        <span class="status-bar__dot status-bar__dot--clean" id="geo-status-dot"></span>
        <span id="geo-status-text">Listo</span>
      </div>
    `;

    app.append(toolbarEl, main, statusBar);

    // ── Initialize components ────────────────────────────────

    this.toolbar = new Toolbar(toolbarEl, {
      onCopy: () => this._copyHtml(),
      onDownload: () => this._downloadHtml(),
      onLint: () => this._runLinter(),
      onUndo: () => this._undo(),
      onToggleLinter: () => this.linterPanel.toggle(),
      onReset: () => this._reset(),
    });
    this.toolbar.render();

    this.dropzone = new Dropzone(dropzoneScreen, (name, html) => this._loadFile(name, html));
    this.dropzone.render();

    this.preview = new Preview(previewPanel, this.engine, () => this._onEdit());

    this.linterPanel = new LinterPanel(linterSidebar);
    this.linterPanel.init();
    this.linterPanel.hide(); // start collapsed
  }

  /* ── File lifecycle ──────────────────────────────────────── */

  /**
   * Load an HTML file into the editor.
   * @private
   * @param {string} filename
   * @param {string} html
   */
  _loadFile(filename, html) {
    this.filename = filename;
    this.engine.load(html);

    // Swap views
    this._dropzoneScreen.classList.add('hidden');
    this._editorLayout.classList.remove('editor-layout--hidden');

    // Update toolbar
    this.toolbar.setFilename(filename);
    this.toolbar.setPatchCount(0);

    // Render preview
    this.preview.render();

    // Run linter
    this._runLinter();

    this._setStatus('clean', 'Listo');
    showToast(`Archivo cargado: ${filename}`, 'success');
  }

  /**
   * Reset to the dropzone state.
   * @private
   */
  _reset() {
    // Confirm if there are unsaved changes
    if (this.engine.isDirty) {
      const ok = confirm(
        `Tienes ${this.engine.patchCount} cambio(s) sin descargar.\n¿Deseas continuar?`
      );
      if (!ok) return;
    }

    this.engine.load('');
    this.filename = '';

    this._editorLayout.classList.add('editor-layout--hidden');
    this._dropzoneScreen.classList.remove('hidden');

    this.toolbar.setFilename('—');
    this.toolbar.setPatchCount(0);
    this.toolbar.setLintCount(0, 0);
    this.linterPanel.render([]);
    this.linterPanel.hide();

    this._setStatus('clean', 'Listo');
  }

  /* ── Editing callbacks ───────────────────────────────────── */

  /**
   * Called after every successful inline edit.
   * @private
   */
  _onEdit() {
    this.toolbar.setPatchCount(this.engine.patchCount);
    this._setStatus('dirty', `${this.engine.patchCount} cambio(s)`);
    this._runLinter();
  }

  /**
   * Undo the last patch.
   * @private
   */
  _undo() {
    const removed = this.engine.undo();
    if (!removed) return;

    this.preview.render();
    this.toolbar.setPatchCount(this.engine.patchCount);
    this._runLinter();

    if (this.engine.isDirty) {
      this._setStatus('dirty', `${this.engine.patchCount} cambio(s)`);
    } else {
      this._setStatus('clean', 'Listo');
    }

    showToast('Cambio deshecho', 'info');
  }

  /* ── Linter ──────────────────────────────────────────────── */

  /**
   * Run the linter on the current HTML result and update the sidebar.
   * @private
   */
  _runLinter() {
    try {
      const result = this.linter.check(this.engine.getResult(), this.filename);
      const findings = result?.findings ?? [];
      this.linterPanel.render(findings);

      const errors = findings.filter((f) => f.severity === 'error').length;
      const warnings = findings.filter((f) => f.severity === 'warning').length;
      this.toolbar.setLintCount(errors, warnings);

      if (findings.length > 0) {
        this.linterPanel.show();
      }
    } catch (err) {
      console.error('[App] Linter error:', err);
    }
  }

  /* ── Export actions ──────────────────────────────────────── */

  /**
   * Copy the current HTML to the clipboard.
   * @private
   */
  async _copyHtml() {
    try {
      await navigator.clipboard.writeText(this.engine.getResult());
      showToast('HTML copiado al portapapeles', 'success');
    } catch (err) {
      // Fallback for non-secure contexts
      this._fallbackCopy(this.engine.getResult());
    }
  }

  /**
   * Fallback copy for environments without clipboard API.
   * @private
   * @param {string} text
   */
  _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('HTML copiado al portapapeles', 'success');
    } catch {
      showToast('No se pudo copiar al portapapeles', 'error');
    }
    document.body.removeChild(ta);
  }

  /**
   * Download the current HTML as a file.
   * @private
   */
  _downloadHtml() {
    const html = this.engine.getResult();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = this.filename || 'output.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    showToast('Archivo descargado', 'success');
  }

  /* ── Status bar ──────────────────────────────────────────── */

  /**
   * Update the status bar.
   * @private
   * @param {'clean'|'dirty'|'error'} state
   * @param {string} text
   */
  _setStatus(state, text) {
    const dot = document.getElementById('geo-status-dot');
    const label = document.getElementById('geo-status-text');
    if (dot) {
      dot.className = `status-bar__dot status-bar__dot--${state}`;
    }
    if (label) {
      label.textContent = text;
    }
  }
}

/* ── Start ──────────────────────────────────────────────── */
new App();
