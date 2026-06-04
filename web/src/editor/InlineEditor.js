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
    wrapper.append(textarea, actions);

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
