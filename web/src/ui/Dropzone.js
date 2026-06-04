/**
 * @fileoverview GEO Engine — Drag & drop file upload component.
 *
 * Renders a full-screen dropzone with upload icon, title, subtitle,
 * and a hidden file input.  Accepts `.html` files only.
 *
 * @module ui/Dropzone
 */

export class Dropzone {
  /**
   * @param {HTMLElement} containerEl — the `.dropzone-screen` wrapper
   * @param {(filename: string, html: string) => void} onFileLoad
   */
  constructor(containerEl, onFileLoad) {
    /** @private */ this._container = containerEl;
    /** @private */ this._onFileLoad = onFileLoad;

    /** @private @type {HTMLElement|null} */
    this._dropzone = null;

    /** @private @type {HTMLInputElement|null} */
    this._fileInput = null;
  }

  /* ── Public API ──────────────────────────────────────────── */

  /** Build and mount the dropzone UI. */
  render() {
    this._container.innerHTML = '';

    // Hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html';
    input.id = 'geo-file-input';
    input.className = 'sr-only';
    this._fileInput = input;

    // Dropzone card
    const zone = document.createElement('div');
    zone.className = 'dropzone';
    zone.id = 'geo-dropzone';
    zone.setAttribute('role', 'button');
    zone.setAttribute('tabindex', '0');
    zone.setAttribute('aria-label', 'Arrastra un archivo HTML o haz clic para seleccionar');

    // Icon
    const iconWrap = document.createElement('div');
    iconWrap.className = 'dropzone__icon';
    iconWrap.innerHTML = /* html */ `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>`;

    // Title
    const title = document.createElement('p');
    title.className = 'dropzone__title';
    title.textContent = 'Arrastra tu archivo HTML aquí';

    // Subtitle
    const subtitle = document.createElement('p');
    subtitle.className = 'dropzone__subtitle';
    subtitle.textContent = 'o haz clic para seleccionar un archivo de tus páginas finales';

    // Badge
    const badge = document.createElement('span');
    badge.className = 'dropzone__badge';
    badge.textContent = '.html';

    zone.append(iconWrap, title, subtitle, badge);
    this._container.append(input, zone);
    this._dropzone = zone;

    // ── Event wiring ─────────────────────────────────────────
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this._readFile(file);
      input.value = ''; // reset so the same file can be re-selected
    });

    // Drag & drop
    zone.addEventListener('dragenter', (e) => this._onDragEnter(e));
    zone.addEventListener('dragover', (e) => this._onDragOver(e));
    zone.addEventListener('dragleave', (e) => this._onDragLeave(e));
    zone.addEventListener('drop', (e) => this._onDrop(e));
  }

  /* ── Private helpers ─────────────────────────────────────── */

  /**
   * Read an HTML file and invoke the callback.
   * @private
   * @param {File} file
   */
  _readFile(file) {
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      console.warn('[Dropzone] Rejected non-HTML file:', file.name);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this._onFileLoad(file.name, reader.result);
      }
    };
    reader.onerror = () => {
      console.error('[Dropzone] FileReader error:', reader.error);
    };
    reader.readAsText(file, 'utf-8');
  }

  /** @private */
  _onDragEnter(e) {
    e.preventDefault();
    this._dropzone?.classList.add('dropzone--active');
  }

  /** @private */
  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer && (e.dataTransfer.dropEffect = 'copy');
  }

  /** @private */
  _onDragLeave(e) {
    e.preventDefault();
    // Only remove if leaving the dropzone boundary
    if (e.relatedTarget && this._dropzone?.contains(/** @type {Node} */ (e.relatedTarget))) return;
    this._dropzone?.classList.remove('dropzone--active');
  }

  /** @private */
  _onDrop(e) {
    e.preventDefault();
    this._dropzone?.classList.remove('dropzone--active');

    const file = e.dataTransfer?.files?.[0];
    if (file) this._readFile(file);
  }
}
