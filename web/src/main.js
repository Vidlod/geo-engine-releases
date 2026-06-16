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
import './styles/wizard.css';

/* ── Core modules ───────────────────────────────────────── */
import { Engine } from './editor/Engine.js';
import { Preview } from './editor/Preview.js';
import { Dropzone } from './ui/Dropzone.js';
import { Toolbar } from './ui/Toolbar.js';
import { LinterPanel } from './ui/LinterPanel.js';
import { DiffView } from './ui/DiffView.js';
import { Wizard } from './ui/Wizard.js';
import { CoursePanel, projectApi } from './ui/CoursePanel.js';
import { showToast } from './ui/Toast.js';
import { UpdateNotifier } from './ui/UpdateNotifier.js';

import { Linter } from './linter/index.js';
import { getQuickFix } from './linter/fixes.js';

/* ── Default linter configuration ───────────────────────── */

/**
 * Build the linter config.  `redFiles` is a LIVE array reference: the app
 * mutates it when the wizard registers RED files and the `pluginfile-red`
 * rule reads it on every check.
 * @param {string[]} redFiles
 */
function buildLinterConfig(redFiles) {
  return {
    rules: {
      'max-br': { enabled: true, max: 1 },
      'br-before-close': { enabled: true },
      'br-between-blocks': { enabled: true },
      'br-before-button': { enabled: true },
      'max-spaces': { enabled: true, max: 2 },
      'terminology-module': { enabled: true },
      'emoticon-span': { enabled: true },
      'link-target': { enabled: true },
      'elibro-proxy': { enabled: true },
      'forbidden-source': { enabled: true },
      'pluginfile-red': { enabled: true, redFiles },
      'tablero-anotaciones': { enabled: true },
      'no-italics': { enabled: true },
      'li-paragraph': { enabled: true },
      'li-period': { enabled: true },
      'producto-final': { enabled: true },
      'strong-heading': { enabled: true },
    },
    course: { last_avance: 5 },
  };
}

/* ═══════════════════════════════════════════════════════════ */
/*  App                                                       */
/* ═══════════════════════════════════════════════════════════ */

class App {
  constructor() {
    /** @type {Engine} */
    this.engine = new Engine();

    /** @type {string[]} RED filenames (live ref shared with pluginfile-red) */
    this.redFiles = [];

    /** @type {InstanceType<typeof Linter>} */
    this.linter = new Linter(buildLinterConfig(this.redFiles));

    /** @type {string} Current loaded filename */
    this.filename = '';

    /** @type {DiffView|null} */
    this.diffView = null;

    /** @type {'home'|'wizard'|'dropzone'|'editor'} */
    this._view = 'home';

    // Component references (assigned in init)
    /** @type {Toolbar} */    this.toolbar = /** @type {any} */ (null);
    /** @type {Dropzone} */   this.dropzone = /** @type {any} */ (null);
    /** @type {Preview} */    this.preview = /** @type {any} */ (null);
    /** @type {LinterPanel} */this.linterPanel = /** @type {any} */ (null);

    /** @type {Wizard|null} Lazy — keeps its state while navigating */
    this.wizard = null;

    /** @type {CoursePanel|null} Lazy — solo en la app de escritorio */
    this.coursePanel = null;

    // DOM references
    /** @type {HTMLElement} */ this._homeScreen = /** @type {any} */ (null);
    /** @type {HTMLElement} */ this._wizardScreen = /** @type {any} */ (null);
    /** @type {HTMLElement} */ this._dropzoneScreen = /** @type {any} */ (null);
    /** @type {HTMLElement} */ this._courseScreen = /** @type {any} */ (null);
    /** @type {HTMLElement} */ this._editorLayout = /** @type {any} */ (null);

    this._init();

    // Inicializar notificador de actualizaciones de Electron
    new UpdateNotifier();
  }

  /* ── Bootstrap ───────────────────────────────────────────── */

  /** @private */
  _init() {
    const app = document.getElementById('app');
    if (!app) {
      throw new Error('#app element not found');
    }
    app.className = 'view-home';

    // Marcas de plataforma para CSS: en Electron la barra superior es la zona
    // de arrastre de la ventana, y en macOS el logo debe librar los semáforos.
    if (window.electronAPI && typeof window.electronAPI.getAppInfo === 'function') {
      document.body.classList.add('is-electron');
      window.electronAPI.getAppInfo().then((info) => {
        if (info && info.platform) document.body.classList.add(`platform-${info.platform}`);
      }).catch(() => { /* sin info de plataforma */ });
    }

    // ── Build the app shell ──────────────────────────────────
    //  <header.toolbar>
    //  <main.main>
    //    <section.home> (visible at start: elegir Asistente / Editor)
    //    <section.wizard-screen> (asistente de 4 pasos)
    //    <section.dropzone-screen> (editor directo)
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

    // Home screen (mode chooser)
    const homeScreen = document.createElement('section');
    homeScreen.className = 'home';
    homeScreen.id = 'geo-home-screen';
    this._homeScreen = homeScreen;

    // Wizard screen
    const wizardScreen = document.createElement('section');
    wizardScreen.className = 'wizard-screen hidden';
    wizardScreen.id = 'geo-wizard-screen';
    wizardScreen.style.cssText = 'display:flex;flex:1;overflow:hidden';
    this._wizardScreen = wizardScreen;

    // Dropzone screen
    const dropzoneScreen = document.createElement('section');
    dropzoneScreen.className = 'dropzone-screen dropzone-view hidden';
    dropzoneScreen.id = 'geo-dropzone-screen';
    this._dropzoneScreen = dropzoneScreen;

    // Course project screen (solo escritorio)
    const courseScreen = document.createElement('section');
    courseScreen.className = 'course-screen hidden';
    courseScreen.id = 'geo-course-screen';
    this._courseScreen = courseScreen;

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
    main.append(homeScreen, wizardScreen, dropzoneScreen, courseScreen, editorLayout);

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
      onRedo: () => this._redo(),
      onToggleDiff: () => this._toggleDiff(),
      onToggleLinter: () => this.linterPanel.toggle(),
      onReset: () => this._reset(),
      getHistory: () => ({
        patches: this.engine.patches,
        redoCount: this.engine.redoStack.length,
      }),
      onRevertTo: (keep) => this._revertTo(keep),
    });
    this.toolbar.render();
    this.toolbar.setViewLabel('Inicio');

    // Dropzone (editor directo) con botón de volver al inicio
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn--ghost dropzone-view__back';
    backBtn.innerHTML = '← Inicio';
    backBtn.addEventListener('click', () => this._showView('home'));

    const dropzoneInner = document.createElement('div');
    dropzoneInner.className = 'dropzone-screen';
    dropzoneInner.style.cssText = 'display:flex;flex:1;align-items:center;justify-content:center';
    dropzoneScreen.append(backBtn, dropzoneInner);

    this.dropzone = new Dropzone(dropzoneInner, (name, html) => this._loadFile(name, html));
    this.dropzone.render();

    this.preview = new Preview(previewPanel, this.engine, () => this._onEdit());

    this.diffView = new DiffView(previewPanel);

    this.linterPanel = new LinterPanel(linterSidebar);
    this.linterPanel.onFindingClick = (finding) => this._onFindingClick(finding);
    this.linterPanel.canFix = (f) => !!getQuickFix(this.engine.getResult(), f);
    this.linterPanel.onFix = (f) => this._fixFinding(f);
    this.linterPanel.onFixAll = () => this._fixAll();
    this.linterPanel.init();
    this.linterPanel.hide(); // start collapsed

    this._setupShortcuts();

    // Aviso al salir con cambios sin exportar
    window.addEventListener('beforeunload', (e) => {
      if (this.engine.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    this._renderHome();
  }

  /**
   * Global keyboard shortcuts (solo activos en la vista del editor).
   * Ctrl+Z deshacer · Ctrl+Shift+Z / Ctrl+Y rehacer · Ctrl+S descargar.
   * @private
   */
  _setupShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (this._view !== 'editor') return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      // Ctrl+S siempre nuestro (evitar el "guardar página" del navegador)
      if (key === 's') {
        e.preventDefault();
        this._downloadHtml();
        return;
      }

      // No robar undo/redo nativos mientras se escribe en un campo
      const t = /** @type {HTMLElement} */ (e.target);
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;

      if (key === 'z' && !e.shiftKey) { e.preventDefault(); this._undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); this._redo(); }
    });
  }

  /* ── Vistas ──────────────────────────────────────────────── */

  /**
   * Show one of the main views, hiding the rest.
   * @private
   * @param {'home'|'wizard'|'dropzone'|'course'|'editor'} view
   */
  _showView(view) {
    this._view = view;
    const app = document.getElementById('app');
    if (app) {
      app.className = `view-${view}`;
    }

    const VIEW_LABELS = {
      home: 'Inicio',
      wizard: 'Asistente de curso',
      dropzone: 'Editor directo',
      course: 'Proyecto de curso',
      editor: '',
    };
    this.toolbar.setViewLabel(VIEW_LABELS[view] || '');

    this._homeScreen.classList.toggle('hidden', view !== 'home');
    this._wizardScreen.classList.toggle('hidden', view !== 'wizard');
    this._dropzoneScreen.classList.toggle('hidden', view !== 'dropzone');
    this._courseScreen.classList.toggle('hidden', view !== 'course');
    this._editorLayout.classList.toggle('editor-layout--hidden', view !== 'editor');

    if (view === 'wizard' && !this.wizard) {
      this.wizard = new Wizard(this._wizardScreen, {
        onLoadHtml: (name, html, redFiles) => this._loadFile(name, html, redFiles),
        onBack: () => this._showView('home'),
      });
      this.wizard.render();
    }

    if (view === 'course') {
      if (!this.coursePanel) {
        this.coursePanel = new CoursePanel(this._courseScreen, {
          onLoadHtml: (name, html, redFiles) => this._loadFile(name, html, redFiles),
          onBack: () => this._showView('home'),
        });
      }
      this.coursePanel.render();
    }
  }

  /**
   * Render the home mode-chooser screen.
   * @private
   */
  _renderHome() {
    // Tarjeta del flujo con agente: solo en la app de escritorio
    const courseCard = projectApi() ? `
        <div class="home__card home__card--secondary home__card--course" id="geo-home-course">
          <span class="home__card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </span>
          <span class="home__card-title">Proyecto de curso</span>
          <span class="home__card-desc">Organiza el curso completo en una carpeta y deja que el agente ejecute las skills GEO: insumos, generación con IA y revisión en un solo flujo.</span>

          <div class="home__flow">
            <div class="home__flow-step">
              <div class="home__flow-number">1</div>
              <div class="home__flow-text">Insumos</div>
            </div>
            <div class="home__flow-arrow">➔</div>
            <div class="home__flow-step">
              <div class="home__flow-number">2</div>
              <div class="home__flow-text">Generar IA</div>
            </div>
            <div class="home__flow-arrow">➔</div>
            <div class="home__flow-step">
              <div class="home__flow-number">3</div>
              <div class="home__flow-text">FLAGS/Editor</div>
            </div>
          </div>

          <button type="button" class="btn btn--ghost home__card-btn">
            <span>Abrir Proyecto</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>` : '';

    this._homeScreen.innerHTML = `
      <div class="home__glow-1"></div>
      <div class="home__glow-2"></div>
      <div class="home__hero">
        <span class="home__badge">v1.9.9 · Moodle Builder</span>
        <h1 class="home__title">GEO Engine</h1>
        <p class="home__subtitle">Maquetación visual inteligente y control de calidad para Moodle UDES</p>
      </div>
      <div class="home__cards ${projectApi() ? 'home__cards--three' : ''}">
        ${courseCard}
        <div class="home__card home__card--secondary" id="geo-home-wizard">
          <span class="home__card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/></svg>
          </span>
          <span class="home__card-title">Asistente de curso</span>
          <span class="home__card-desc">Crea prompts estructurados para la IA a partir de tus archivos AAA (.docx) e instrucciones (.pdf) conservando los RED.</span>
          
          <div class="home__flow">
            <div class="home__flow-step">
              <div class="home__flow-number">1</div>
              <div class="home__flow-text">Subir Docs</div>
            </div>
            <div class="home__flow-arrow">➔</div>
            <div class="home__flow-step">
              <div class="home__flow-number">2</div>
              <div class="home__flow-text">Registrar RED</div>
            </div>
            <div class="home__flow-arrow">➔</div>
            <div class="home__flow-step">
              <div class="home__flow-number">3</div>
              <div class="home__flow-text">Copiar Prompt</div>
            </div>
            <div class="home__flow-arrow">➔</div>
            <div class="home__flow-step">
              <div class="home__flow-number">4</div>
              <div class="home__flow-text">Linter/Editor</div>
            </div>
          </div>

          <button type="button" class="btn btn--ghost home__card-btn">
            <span>Comenzar Flujo</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <div class="home__card home__card--secondary" id="geo-home-editor">
          <span class="home__card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </span>
          <span class="home__card-title">Editor directo</span>
          <span class="home__card-desc">Inspecciona y edita directamente un archivo HTML de Moodle existente utilizando la guía interactiva del linter.</span>
          
          <div class="home__flow">
            <div class="home__flow-step">
              <div class="home__flow-number">1</div>
              <div class="home__flow-text">Cargar HTML</div>
            </div>
            <div class="home__flow-arrow">➔</div>
            <div class="home__flow-step">
              <div class="home__flow-number">2</div>
              <div class="home__flow-text">Corregir Linter</div>
            </div>
          </div>

          <button type="button" class="btn btn--ghost home__card-btn">
            <span>Abrir Editor</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>`;

    const addCardListeners = (selector, view) => {
      const el = this._homeScreen.querySelector(selector);
      if (!el) return;
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.addEventListener('click', () => this._showView(view));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._showView(view); }
      });
    };
    addCardListeners('#geo-home-wizard', 'wizard');
    addCardListeners('#geo-home-editor', 'dropzone');
    addCardListeners('#geo-home-course', 'course');

    // Consultar dinámicamente la versión real de la app Electron
    const badge = this._homeScreen.querySelector('.home__badge');
    if (badge && window.electronAPI && typeof window.electronAPI.getAppInfo === 'function') {
      window.electronAPI.getAppInfo().then((info) => {
        if (info && info.version) {
          badge.textContent = `v${info.version} · Moodle Builder`;
        }
      }).catch(err => console.error('[main] Error al obtener info de la app:', err));
    }
  }

  /* ── File lifecycle ──────────────────────────────────────── */

  /**
   * Load an HTML file into the editor.
   * @private
   * @param {string} filename
   * @param {string} html
   * @param {string[]} [redFiles] — RED filenames from the wizard (para pluginfile-red)
   */
  _loadFile(filename, html, redFiles) {
    this.filename = filename;
    this.engine.load(html);

    // Lista RED viva: el linter la lee en cada check
    if (Array.isArray(redFiles)) {
      this.redFiles.length = 0;
      this.redFiles.push(...redFiles);
    }

    // Swap views
    this._showView('editor');
    this._closeDiff();

    // Update toolbar
    this.toolbar.setFilename(filename);
    this.toolbar.setPatchCount(0);
    this.toolbar.setProjectMode(!!(this.coursePanel && this.coursePanel._project));

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
    this._closeDiff();

    // Si hay un proyecto de curso activo, volvemos a la pantalla de curso, no a inicio.
    if (this.coursePanel && this.coursePanel._project) {
      this._showView('course');
    } else {
      this.redFiles.length = 0;
      this._showView('home');
    }

    this.toolbar.setFilename('—');
    this.toolbar.setPatchCount(0);
    this.toolbar.setLintCount(0, 0);
    this.toolbar.setProjectMode(false);
    this.linterPanel.render([]);
    this.linterPanel.hide();

    this._setStatus('clean', 'Listo');
  }

  /* ── Editing callbacks ───────────────────────────────────── */

  /**
   * Refresh toolbar / status / linter / diff after any change to the patch list.
   * @private
   */
  _afterPatchChange() {
    this.toolbar.setPatchCount(this.engine.patchCount, this.engine.redoStack.length);
    if (this.engine.isDirty) {
      this._setStatus('dirty', `${this.engine.patchCount} cambio(s)`);
    } else {
      this._setStatus('clean', 'Listo');
    }
    this._runLinter();
    this._refreshDiff();
  }

  /**
   * Called after every successful inline edit.
   * @private
   */
  _onEdit() {
    this._afterPatchChange();
  }

  /**
   * Undo the last patch.
   * @private
   */
  _undo() {
    const removed = this.engine.undo();
    if (!removed) return;

    this.preview.render();
    this._afterPatchChange();
    showToast(`Deshecho: ${removed.label || 'cambio'}`, 'info');
  }

  /**
   * Re-apply the most recently undone patch.
   * @private
   */
  _redo() {
    const restored = this.engine.redo();
    if (!restored) return;

    this.preview.render();
    this._afterPatchChange();
    showToast(`Rehecho: ${restored.label || 'cambio'}`, 'info');
  }

  /**
   * Undo patches until only `keep` remain (historial: "deshacer hasta aquí").
   * @private
   * @param {number} keep
   */
  _revertTo(keep) {
    const undone = this.engine.revertTo(keep);
    if (undone === 0) return;

    this.preview.render();
    this._afterPatchChange();
    showToast(`${undone} cambio(s) deshechos`, 'info');
  }

  /* ── Vista diff ──────────────────────────────────────────── */

  /**
   * Toggle the original-vs-result diff overlay.
   * @private
   */
  _toggleDiff() {
    if (this.diffView.isOpen) {
      this._closeDiff();
    } else {
      this.diffView.render(this.engine.originalHtml, this.engine.getResult());
      this.toolbar.setDiffActive(true);
    }
  }

  /** @private */
  _closeDiff() {
    this.diffView?.close();
    this.toolbar.setDiffActive(false);
  }

  /** Re-render the diff if it is open (after undo/redo/fix). @private */
  _refreshDiff() {
    if (!this.diffView?.isOpen) return;
    if (!this.engine.isDirty) {
      this._closeDiff();
      return;
    }
    this.diffView.render(this.engine.originalHtml, this.engine.getResult());
  }

  /* ── Quick-fixes del linter ──────────────────────────────── */

  /**
   * Apply the quick fix of a single finding.
   * @private
   * @param {object} finding
   */
  _fixFinding(finding) {
    const fix = getQuickFix(this.engine.getResult(), finding);
    if (!fix) {
      showToast('Este hallazgo ya no tiene corrección automática', 'info');
      this._runLinter();
      return;
    }
    try {
      this.engine.addPatch(fix.original, fix.replacement, fix.label);
      this.preview.render();
      this._afterPatchChange();
      showToast(`Corregido: ${fix.label}`, 'success');
    } catch (err) {
      console.error('[App] Quick-fix failed:', err);
      showToast('No se pudo aplicar la corrección', 'error');
    }
  }

  /**
   * Apply every available quick fix, re-running the linter between fixes so
   * the positions stay correct as the HTML changes.
   * @private
   */
  _fixAll() {
    let applied = 0;
    const MAX = 200; // tope de seguridad contra ciclos

    while (applied < MAX) {
      const html = this.engine.getResult();
      const findings = this.linter.check(html, this.filename)?.findings ?? [];

      let fixed = false;
      for (const f of findings) {
        const fix = getQuickFix(html, f);
        if (!fix) continue;
        try {
          this.engine.addPatch(fix.original, fix.replacement, fix.label);
          applied++;
          fixed = true;
          break; // re-lint con el HTML ya parchado
        } catch { /* el siguiente hallazgo puede seguir siendo corregible */ }
      }
      if (!fixed) break;
    }

    if (applied === 0) {
      showToast('No hay correcciones automáticas pendientes', 'info');
      return;
    }

    this.preview.render();
    this._afterPatchChange();
    showToast(`${applied} corrección(es) aplicadas`, 'success');
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

  /**
   * Called when a linter finding card is clicked in the sidebar.
   * @private
   * @param {object} finding
   */
  _onFindingClick(finding) {
    if (this.preview) {
      this.preview.highlightFinding(finding);
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
