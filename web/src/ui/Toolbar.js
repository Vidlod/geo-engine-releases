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
};

export class Toolbar {
  /**
   * @param {HTMLElement} containerEl — the toolbar DOM element
   * @param {Object} callbacks
   * @param {() => void}  callbacks.onCopy
   * @param {() => void}  callbacks.onDownload
   * @param {() => void}  callbacks.onLint
   * @param {() => void}  callbacks.onUndo
   * @param {() => void}  callbacks.onToggleLinter
   * @param {() => void}  callbacks.onReset
   */
  constructor(containerEl, callbacks) {
    /** @private */ this._el = containerEl;
    /** @private */ this._cb = callbacks;

    /** @private @type {HTMLElement|null} */ this._filenameEl = null;
    /** @private @type {HTMLElement|null} */ this._changesBadge = null;
    /** @private @type {HTMLElement|null} */ this._lintBadge = null;
    /** @private @type {HTMLButtonElement|null} */ this._undoBtn = null;
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

    // Separator
    const sep = document.createElement('div');
    sep.className = 'toolbar__separator';

    // Filename
    const filename = document.createElement('span');
    filename.className = 'toolbar__filename';
    filename.id = 'geo-toolbar-filename';
    filename.textContent = '—';
    this._filenameEl = filename;

    // Changes badge
    const changesBadge = document.createElement('span');
    changesBadge.className = 'changes-badge hidden';
    changesBadge.id = 'geo-changes-badge';
    this._changesBadge = changesBadge;

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'toolbar__spacer';

    // Actions container
    const actions = document.createElement('div');
    actions.className = 'toolbar__actions';

    // Undo
    const undoBtn = this._makeBtn('Deshacer', ICONS.undo, 'btn--ghost', 'geo-btn-undo');
    undoBtn.disabled = true;
    undoBtn.addEventListener('click', () => this._cb.onUndo());
    this._undoBtn = undoBtn;

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
    panelBtn.addEventListener('click', () => this._cb.onToggleLinter());

    // New file / reset (icon button)
    const resetBtn = this._makeBtn('', ICONS.reset, 'btn--ghost btn--icon', 'geo-btn-reset');
    resetBtn.title = 'Nuevo archivo';
    resetBtn.addEventListener('click', () => this._cb.onReset());

    actions.append(undoBtn, copyBtn, dlBtn, lintBtn, lintBadge, panelBtn, resetBtn);

    this._el.append(logo, sep, filename, changesBadge, spacer, actions);
  }

  /**
   * Update the displayed filename.
   * @param {string} name
   */
  setFilename(name) {
    if (this._filenameEl) this._filenameEl.textContent = name;
  }

  /**
   * Update the changes badge.
   * @param {number} count
   */
  setPatchCount(count) {
    if (!this._changesBadge) return;
    if (count > 0) {
      this._changesBadge.textContent = `${count} cambio${count > 1 ? 's' : ''}`;
      this._changesBadge.classList.remove('hidden');
    } else {
      this._changesBadge.classList.add('hidden');
    }
    if (this._undoBtn) {
      this._undoBtn.disabled = count === 0;
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
