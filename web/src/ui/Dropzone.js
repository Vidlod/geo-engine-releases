/**
 * @fileoverview GEO Engine — Drag & drop file upload component.
 *
 * Renders a full-screen dropzone with upload icon, title, subtitle,
 * a hidden file input, and a "Pegar código HTML" button that opens
 * a modal allowing the user to paste raw HTML directly.
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

    // Divider
    const divider = document.createElement('div');
    divider.className = 'dropzone__divider';
    divider.innerHTML = '<span>o</span>';

    // Paste button
    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.className = 'btn btn--ghost dropzone__paste-btn';
    pasteBtn.id = 'geo-paste-btn';
    pasteBtn.innerHTML = /* html */ `
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Pegar código HTML`;

    zone.append(iconWrap, title, subtitle, badge, divider, pasteBtn);
    this._container.append(input, zone);
    this._dropzone = zone;

    // ── Event wiring ─────────────────────────────────────────
    zone.addEventListener('click', (e) => {
      // Prevent file-input from opening when paste button is clicked
      if (pasteBtn.contains(/** @type {Node} */ (e.target))) return;
      input.click();
    });
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    pasteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openPasteModal();
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

  /* ── Paste modal ─────────────────────────────────────────── */

  /** Open the paste-HTML modal. @private */
  _openPasteModal() {
    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'paste-modal-backdrop';
    backdrop.id = 'geo-paste-modal-backdrop';

    // Modal
    const modal = document.createElement('div');
    modal.className = 'paste-modal';
    modal.id = 'geo-paste-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'geo-paste-modal-title');

    // Header
    const header = document.createElement('div');
    header.className = 'paste-modal__header';

    const modalTitle = document.createElement('h2');
    modalTitle.className = 'paste-modal__title';
    modalTitle.id = 'geo-paste-modal-title';
    modalTitle.innerHTML = /* html */ `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Pegar código HTML`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'paste-modal__close';
    closeBtn.id = 'geo-paste-modal-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.innerHTML = /* html */ `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;

    header.append(modalTitle, closeBtn);

    // Filename row
    const filenameRow = document.createElement('div');
    filenameRow.className = 'paste-modal__filename-row';

    const filenameLabel = document.createElement('label');
    filenameLabel.className = 'paste-modal__label';
    filenameLabel.htmlFor = 'geo-paste-filename';
    filenameLabel.textContent = 'Nombre del archivo (opcional)';

    const filenameInput = document.createElement('input');
    filenameInput.type = 'text';
    filenameInput.className = 'paste-modal__filename-input';
    filenameInput.id = 'geo-paste-filename';
    filenameInput.placeholder = 'Ej: Momento Evaluativo 1.html';
    filenameInput.spellcheck = false;

    filenameRow.append(filenameLabel, filenameInput);

    // Textarea section
    const textareaLabel = document.createElement('label');
    textareaLabel.className = 'paste-modal__label';
    textareaLabel.htmlFor = 'geo-paste-textarea';
    textareaLabel.textContent = 'Código HTML';

    const textarea = document.createElement('textarea');
    textarea.className = 'paste-modal__textarea';
    textarea.id = 'geo-paste-textarea';
    textarea.placeholder = 'Pega aquí el código HTML de la página de Moodle…';
    textarea.spellcheck = false;
    textarea.autocomplete = 'off';

    // Character count
    const charCount = document.createElement('div');
    charCount.className = 'paste-modal__charcount';
    charCount.id = 'geo-paste-charcount';
    charCount.textContent = '0 caracteres';

    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = len.toLocaleString('es-CO') + ' caracteres';
      btnLoad.disabled = len === 0;
    });

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'paste-modal__footer';

    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'btn btn--ghost paste-modal__btn-clear';
    btnClear.id = 'geo-paste-clear';
    btnClear.textContent = 'Limpiar';
    btnClear.addEventListener('click', () => {
      textarea.value = '';
      charCount.textContent = '0 caracteres';
      btnLoad.disabled = true;
      textarea.focus();
    });

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn btn--ghost';
    btnCancel.id = 'geo-paste-cancel';
    btnCancel.textContent = 'Cancelar';
    btnCancel.addEventListener('click', () => close());

    const btnLoad = document.createElement('button');
    btnLoad.type = 'button';
    btnLoad.className = 'btn btn--primary';
    btnLoad.id = 'geo-paste-load';
    btnLoad.disabled = true;
    btnLoad.innerHTML = /* html */ `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Cargar HTML`;

    footer.append(btnClear, btnCancel, btnLoad);

    modal.append(header, filenameRow, textareaLabel, textarea, charCount, footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // ── Animate in ───────────────────────────────────────────
    requestAnimationFrame(() => backdrop.classList.add('paste-modal-backdrop--open'));

    // Focus textarea after animation
    setTimeout(() => textarea.focus(), 80);

    // ── Close helpers ─────────────────────────────────────────
    const close = () => {
      backdrop.classList.remove('paste-modal-backdrop--open');
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    };

    closeBtn.addEventListener('click', () => close());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close();
      }
    });

    // ── Load handler ──────────────────────────────────────────
    btnLoad.addEventListener('click', () => {
      const html = textarea.value.trim();
      if (!html) return;

      let name = filenameInput.value.trim();
      if (!name) name = 'codigo-pegado.html';
      if (!name.endsWith('.html') && !name.endsWith('.htm')) name += '.html';

      close();
      this._onFileLoad(name, html);
    });
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
