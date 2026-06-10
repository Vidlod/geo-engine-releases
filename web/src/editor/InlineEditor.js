/**
 * @fileoverview GEO Engine — Floating inline text editor.
 *
 * When the user clicks an editable text span inside the preview, an
 * `InlineEditor` appears **on top** of the element.  The textarea inherits
 * font metrics from the target so the editing experience feels in-place.
 *
 * Keyboard:
 *  • Ctrl+Enter / ⌘+Enter → save
 *  • Escape               → cancel
 *
 * @module editor/InlineEditor
 */

export class InlineEditor {
  /**
   * @param {HTMLElement} previewContainer
   * @param {(newText: string) => void} onSave
   * @param {() => void}               onCancel
   */
  constructor(previewContainer, onSave, onCancel) {
    /** @private */ this._container = previewContainer;
    /** @private */ this._onSave = onSave;
    /** @private */ this._onCancel = onCancel;

    /** @private @type {HTMLElement|null} */
    this._el = null;
    /** @private @type {HTMLTextAreaElement|null} */
    this._textarea = null;
    /** @private @type {HTMLElement|null} */
    this._targetElement = null;

    /** @private */ this._handleKeydown = this._onKeydown.bind(this);
    /** @private */ this._handleInput = this._autoResize.bind(this);
  }

  /* ── Public API ──────────────────────────────────────────── */

  open(element, currentText) {
    this.close();

    this._targetElement = element;
    element.classList.add('geo-editing');

    const wrapper = document.createElement('div');
    wrapper.className = 'inline-editor';
    wrapper.id = 'geo-inline-editor';

    const textarea = document.createElement('textarea');
    textarea.className = 'inline-editor__input';
    textarea.value = currentText;
    textarea.rows = 1;

    // ── Mini-formato (whitelist GEO: solo <strong>; cursivas prohibidas) ──
    const format = document.createElement('div');
    format.className = 'inline-editor__format';

    const btnBold = document.createElement('button');
    btnBold.className = 'inline-editor__fmt-btn';
    btnBold.innerHTML = '<strong>B</strong>';
    btnBold.title = 'Negrita (<strong>) sobre la selección';
    btnBold.type = 'button';
    btnBold.addEventListener('click', () => this._wrapSelection('strong'));

    const btnClean = document.createElement('button');
    btnClean.className = 'inline-editor__fmt-btn';
    btnClean.textContent = 'Quitar formato';
    btnClean.title = 'Quitar etiquetas de formato de la selección';
    btnClean.type = 'button';
    btnClean.addEventListener('click', () => this._stripFormat());

    format.append(btnBold, btnClean);

    const actions = document.createElement('div');
    actions.className = 'inline-editor__actions';

    const btnSave = document.createElement('button');
    btnSave.className = 'inline-editor__btn inline-editor__btn--save';
    btnSave.textContent = '✓ Guardar';
    btnSave.type = 'button';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'inline-editor__btn inline-editor__btn--cancel';
    btnCancel.textContent = '✗ Cancelar';
    btnCancel.type = 'button';

    actions.append(btnSave, btnCancel);
    wrapper.append(textarea, format, actions);

    this._applyFontStyles(textarea, element);
    this._positionOver(wrapper, element);

    this._container.appendChild(wrapper);

    this._el = wrapper;
    this._textarea = textarea;

    this._autoResize();
    textarea.focus();
    textarea.select();

    textarea.addEventListener('keydown', this._handleKeydown);
    textarea.addEventListener('input', this._handleInput);
    btnSave.addEventListener('click', () => this._save());
    btnCancel.addEventListener('click', () => this._cancel());
  }

  close() {
    if (this._textarea) {
      this._textarea.removeEventListener('keydown', this._handleKeydown);
      this._textarea.removeEventListener('input', this._handleInput);
    }
    if (this._targetElement) {
      this._targetElement.classList.remove('geo-editing');
      this._targetElement = null;
    }
    if (this._el?.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
    this._textarea = null;
  }

  get isOpen() { return this._el !== null; }

  /* ── Private ─────────────────────────────────────────────── */

  /** @private */
  _positionOver(wrapper, target) {
    const containerRect = this._container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    wrapper.style.top = `${targetRect.top - containerRect.top + this._container.scrollTop}px`;
    wrapper.style.left = `${targetRect.left - containerRect.left + this._container.scrollLeft}px`;
    wrapper.style.width = `${Math.max(targetRect.width + 40, 220)}px`;
  }

  /** @private */
  _applyFontStyles(textarea, source) {
    const cs = getComputedStyle(source);
    textarea.style.fontFamily = cs.fontFamily;
    textarea.style.fontSize = cs.fontSize;
    textarea.style.fontWeight = cs.fontWeight;
    textarea.style.lineHeight = cs.lineHeight;
    textarea.style.letterSpacing = cs.letterSpacing;
  }

  /** @private */
  _autoResize() {
    const ta = this._textarea;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  /**
   * Wrap the textarea selection in `<tag>…</tag>` (or unwrap when the
   * selection is already exactly wrapped — toggle behaviour).
   * @private
   * @param {string} tag
   */
  _wrapSelection(tag) {
    const ta = this._textarea;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return; // sin selección, nada que envolver

    const sel = ta.value.slice(start, end);
    const open = `<${tag}>`;
    const close = `</${tag}>`;

    const wrapped = sel.startsWith(open) && sel.endsWith(close)
      ? sel.slice(open.length, sel.length - close.length)  // toggle off
      : open + sel + close;

    ta.value = ta.value.slice(0, start) + wrapped + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(start, start + wrapped.length);
    this._autoResize();
  }

  /**
   * Strip formatting tags (strong/b/em/i/u/span) from the selection,
   * keeping the plain text.
   * @private
   */
  _stripFormat() {
    const ta = this._textarea;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return;

    const sel = ta.value.slice(start, end);
    const clean = sel.replace(/<\/?(?:strong|b|em|i|u|span)\b[^>]*>/gi, '');
    if (clean === sel) return;

    ta.value = ta.value.slice(0, start) + clean + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(start, start + clean.length);
    this._autoResize();
  }

  /** @private */
  _onKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); this._cancel(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._save(); }
  }

  /** @private */
  _save() {
    const value = this._textarea?.value ?? '';
    this.close();
    this._onSave(value);
  }

  /** @private */
  _cancel() {
    this.close();
    this._onCancel();
  }
}
