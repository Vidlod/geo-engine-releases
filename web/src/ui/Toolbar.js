/**
 * @fileoverview GEO Engine — Top toolbar component.
 *
 * Layout: Logo | Separator | Filename | Changes badge | Spacer | Actions
 *
 * @module ui/Toolbar
 */

/* ── SVG icon paths (inline, tiny) ─────────────────────────── */
const ICONS = {
  undo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
         </svg>`,
  copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
           <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
         </svg>`,
  download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
               <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
             </svg>`,
  lint: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
           <polyline points="16 17 21 12 16 7"/>
           <line x1="21" y1="12" x2="9" y2="12"/>
         </svg>`,
  panel: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>`,
  reset: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>`,
  redo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
         </svg>`,
  diff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M12 3v18"/><rect x="3" y="8" width="6" height="8" rx="1"/>
           <rect x="15" y="8" width="6" height="8" rx="1"/>
         </svg>`,
};

export class Toolbar {
  /**
   * @param {HTMLElement} containerEl — the toolbar DOM element
   * @param {Object} callbacks
   * @param {() => void}  callbacks.onCopy
   * @param {() => void}  callbacks.onDownload
   * @param {() => void}  callbacks.onLint
   * @param {() => void}  callbacks.onUndo
   * @param {() => void}  callbacks.onRedo
   * @param {() => void}  callbacks.onToggleDiff
   * @param {() => void}  callbacks.onToggleLinter
   * @param {() => void}  callbacks.onReset
   * @param {() => {patches: Array<{label: string}>, redoCount: number}} callbacks.getHistory
   * @param {(keep: number) => void} callbacks.onRevertTo — deshacer hasta conservar `keep` cambios
   */
  constructor(containerEl, callbacks) {
    /** @private */ this._el = containerEl;
    /** @private */ this._cb = callbacks;

    /** @private @type {HTMLElement|null} */ this._filenameEl = null;
    /** @private @type {HTMLElement|null} */ this._changesBadge = null;
    /** @private @type {HTMLElement|null} */ this._lintBadge = null;
    /** @private @type {HTMLButtonElement|null} */ this._undoBtn = null;
    /** @private @type {HTMLButtonElement|null} */ this._redoBtn = null;
    /** @private @type {HTMLButtonElement|null} */ this._diffBtn = null;
    /** @private @type {HTMLElement|null} */ this._historyEl = null;
    /** @private @type {HTMLElement|null} */ this._viewLabelEl = null;
  }

  /* ── Public API ──────────────────────────────────────────── */

  /** Build and mount toolbar DOM. */
  render() {
    this._el.innerHTML = '';
    this._el.className = 'toolbar';
    this._el.id = 'geo-toolbar';

    // Logo
    const logo = document.createElement('div');
    logo.className = 'toolbar__logo';
    logo.innerHTML = `<div class="toolbar__logo-icon">GE</div><span>GEO Engine</span>`;

    // View label (shows current screen name in non-editor views)
    const viewLabel = document.createElement('span');
    viewLabel.className = 'toolbar__view-label';
    viewLabel.id = 'geo-toolbar-view-label';
    viewLabel.setAttribute('aria-live', 'polite');
    this._viewLabelEl = viewLabel;

    // Separator
    const sep = document.createElement('div');
    sep.className = 'toolbar__separator';

    // Filename
    const filename = document.createElement('span');
    filename.className = 'toolbar__filename';
    filename.id = 'geo-toolbar-filename';
    filename.textContent = '—';
    this._filenameEl = filename;

    // Changes badge — clicable: abre el historial de cambios
    const changesBadge = document.createElement('button');
    changesBadge.type = 'button';
    changesBadge.className = 'changes-badge changes-badge--btn hidden';
    changesBadge.id = 'geo-changes-badge';
    changesBadge.title = 'Ver historial de cambios';
    changesBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleHistory();
    });
    this._changesBadge = changesBadge;

    // Historial (dropdown anclado bajo el badge)
    const history = document.createElement('div');
    history.className = 'toolbar__history hidden';
    history.id = 'geo-history-panel';
    this._historyEl = history;

    document.addEventListener('click', (e) => {
      if (this._historyEl?.classList.contains('hidden')) return;
      const t = /** @type {Node} */ (e.target);
      if (history.contains(t) || changesBadge.contains(t)) return;
      history.classList.add('hidden');
    });

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'toolbar__spacer';

    // Actions container
    const actions = document.createElement('div');
    actions.className = 'toolbar__actions';

    // Undo
    const undoBtn = this._makeBtn('Deshacer', ICONS.undo, 'btn--ghost', 'geo-btn-undo');
    undoBtn.disabled = true;
    undoBtn.title = 'Deshacer (Ctrl+Z)';
    undoBtn.addEventListener('click', () => this._cb.onUndo());
    this._undoBtn = undoBtn;

    // Redo
    const redoBtn = this._makeBtn('', ICONS.redo, 'btn--ghost btn--icon', 'geo-btn-redo');
    redoBtn.disabled = true;
    redoBtn.title = 'Rehacer (Ctrl+Shift+Z)';
    redoBtn.setAttribute('aria-label', 'Rehacer');
    redoBtn.addEventListener('click', () => this._cb.onRedo());
    this._redoBtn = redoBtn;

    // Diff (original vs resultado)
    const diffBtn = this._makeBtn('Cambios', ICONS.diff, 'btn--ghost', 'geo-btn-diff');
    diffBtn.disabled = true;
    diffBtn.title = 'Comparar original vs resultado';
    diffBtn.addEventListener('click', () => this._cb.onToggleDiff());
    this._diffBtn = diffBtn;

    // Copy
    const copyBtn = this._makeBtn('Copiar HTML', ICONS.copy, 'btn--primary', 'geo-btn-copy');
    copyBtn.addEventListener('click', () => this._cb.onCopy());

    // Download
    const dlBtn = this._makeBtn('Descargar', ICONS.download, 'btn--ghost', 'geo-btn-download');
    dlBtn.addEventListener('click', () => this._cb.onDownload());

    // Run linter
    const lintBtn = this._makeBtn('Linter', ICONS.lint, 'btn--ghost', 'geo-btn-lint');
    lintBtn.addEventListener('click', () => this._cb.onLint());

    // Lint badge (next to linter button)
    const lintBadge = document.createElement('span');
    lintBadge.className = 'changes-badge hidden';
    lintBadge.id = 'geo-lint-badge';
    this._lintBadge = lintBadge;

    // Toggle linter panel (icon button)
    const panelBtn = this._makeBtn('', ICONS.panel, 'btn--ghost btn--icon', 'geo-btn-toggle-panel');
    panelBtn.title = 'Panel del Linter';
    panelBtn.setAttribute('aria-label', 'Mostrar/ocultar panel del Linter');
    panelBtn.addEventListener('click', () => this._cb.onToggleLinter());

    // New file / reset (icon button)
    const resetBtn = this._makeBtn('', ICONS.reset, 'btn--ghost btn--icon', 'geo-btn-reset');
    resetBtn.title = 'Nuevo archivo';
    resetBtn.setAttribute('aria-label', 'Nuevo archivo — volver al inicio');
    resetBtn.addEventListener('click', () => this._cb.onReset());

    actions.append(undoBtn, redoBtn, diffBtn, copyBtn, dlBtn, lintBtn, lintBadge, panelBtn, resetBtn);

    this._el.append(logo, viewLabel, sep, filename, changesBadge, history, spacer, actions);
  }

  /**
   * Update the displayed filename.
   * @param {string} name
   */
  setFilename(name) {
    if (this._filenameEl) this._filenameEl.textContent = name;
  }

  /**
   * Update the view label shown in non-editor screens.
   * @param {string} label
   */
  setViewLabel(label) {
    if (this._viewLabelEl) this._viewLabelEl.textContent = label;
  }

  /**
   * Update the changes badge and the undo/redo/diff button states.
   * @param {number} count            — applied patches
   * @param {number} [redoCount=0]    — patches available for redo
   */
  setPatchCount(count, redoCount = 0) {
    if (!this._changesBadge) return;
    if (count > 0) {
      this._changesBadge.textContent = `${count} cambio${count > 1 ? 's' : ''} ▾`;
      this._changesBadge.classList.remove('hidden');
    } else {
      this._changesBadge.classList.add('hidden');
      this._historyEl?.classList.add('hidden');
    }
    if (this._undoBtn) this._undoBtn.disabled = count === 0;
    if (this._redoBtn) this._redoBtn.disabled = redoCount === 0;
    if (this._diffBtn) this._diffBtn.disabled = count === 0;

    // Si el historial está abierto, refrescarlo en vivo
    if (this._historyEl && !this._historyEl.classList.contains('hidden')) {
      if (count === 0 && redoCount === 0) {
        this._historyEl.classList.add('hidden');
      } else {
        this._renderHistory();
      }
    }
  }

  /** Mark the diff button as active/inactive. @param {boolean} active */
  setDiffActive(active) {
    this._diffBtn?.classList.toggle('btn--active', active);
  }

  /* ── Historial de cambios ────────────────────────────────── */

  /** Toggle the history dropdown. @private */
  _toggleHistory() {
    if (!this._historyEl) return;
    const hidden = this._historyEl.classList.contains('hidden');
    if (hidden) {
      this._renderHistory();
      this._historyEl.classList.remove('hidden');
    } else {
      this._historyEl.classList.add('hidden');
    }
  }

  /** Rebuild the history dropdown from getHistory(). @private */
  _renderHistory() {
    if (!this._historyEl || typeof this._cb.getHistory !== 'function') return;
    const { patches, redoCount } = this._cb.getHistory();

    const el = this._historyEl;
    el.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'toolbar__history-head';
    head.textContent = `Historial · ${patches.length} cambio(s)`;
    el.appendChild(head);

    if (redoCount > 0) {
      const redoRow = document.createElement('button');
      redoRow.type = 'button';
      redoRow.className = 'toolbar__history-row toolbar__history-row--redo';
      redoRow.innerHTML = `<span class="toolbar__history-num">↪</span>` +
        `<span class="toolbar__history-label">Rehacer (${redoCount} disponible${redoCount > 1 ? 's' : ''})</span>`;
      redoRow.addEventListener('click', () => this._cb.onRedo());
      el.appendChild(redoRow);
    }

    // Más reciente primero; clic = volver al estado ANTERIOR a ese cambio
    for (let i = patches.length - 1; i >= 0; i--) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'toolbar__history-row';
      row.title = 'Deshacer hasta antes de este cambio';
      row.innerHTML = `<span class="toolbar__history-num">${i + 1}</span>` +
        `<span class="toolbar__history-label"></span>` +
        `<span class="toolbar__history-undo">↩</span>`;
      row.querySelector('.toolbar__history-label').textContent =
        patches[i].label || 'Edición';
      row.addEventListener('click', () => this._cb.onRevertTo(i));
      el.appendChild(row);
    }
  }

  /**
   * Update the lint results badge.
   * @param {number} errors
   * @param {number} warnings
   */
  setLintCount(errors, warnings) {
    if (!this._lintBadge) return;
    const total = errors + warnings;
    if (total > 0) {
      this._lintBadge.textContent = `${errors}E ${warnings}W`;
      this._lintBadge.classList.remove('hidden');
      this._lintBadge.style.background =
        errors > 0 ? 'var(--error-soft)' : 'var(--warning-soft)';
      this._lintBadge.style.color =
        errors > 0 ? 'var(--error)' : 'var(--warning)';
    } else {
      this._lintBadge.classList.add('hidden');
    }
  }

  /**
   * Cambia el título/tooltip del botón de cerrar según si hay un proyecto activo.
   * @param {boolean} isCourse
   */
  setProjectMode(isCourse) {
    const btn = this._el.querySelector('#geo-btn-reset');
    if (btn) {
      btn.title = isCourse ? 'Cerrar y volver al proyecto' : 'Nuevo archivo';
    }
  }

  /* ── Private helpers ─────────────────────────────────────── */

  /**
   * Create a toolbar button.
   * @private
   * @param {string} label
   * @param {string} iconSvg
   * @param {string} variant — e.g. 'btn--primary'
   * @param {string} id
   * @returns {HTMLButtonElement}
   */
  _makeBtn(label, iconSvg, variant, id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${variant}`;
    btn.id = id;

    if (iconSvg) btn.insertAdjacentHTML('beforeend', iconSvg);
    if (label) {
      const span = document.createElement('span');
      span.textContent = label;
      btn.appendChild(span);
    }

    return btn;
  }
}
