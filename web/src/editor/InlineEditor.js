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
   * @param {HTMLElement} previewContainer — the `.preview-container` element
   *   (used as the positioning ancestor)
   * @param {(newText: string) => void} onSave  — called with the edited text
   * @param {() => void}                onCancel — called when the user cancels
   */
  constructor(previewContainer, onSave, onCancel) {
    /** @private */ this._container = previewContainer;
    /** @private */ this._onSave = onSave;
    /** @private */ this._onCancel = onCancel;

    /** @private @type {HTMLElement|null} */
    this._el = null;

    /** @private @type {HTMLTextAreaElement|null} */
    this._textarea = null;

    /** @private @type {HTMLElement|null} — the span being edited */
    this._targetElement = null;

    /** @private */ this._handleKeydown = this._onKeydown.bind(this);
    /** @private */ this._handleInput = this._autoResize.bind(this);
  }

  /* ── Public API ──────────────────────────────────────────── */

  /**
   * Open the editor over `element`.
   * @param {HTMLElement} element     — the `[data-geo-editable]` span
   * @param {string}      currentText — current text content of the span
   */
  open(element, currentText) {
    // Close any previous instance
    this.close();

    this._targetElement = element;
    element.classList.add('geo-editing');

    // Build the DOM
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
    btnSave.id = 'geo-inline-save';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'inline-editor__btn inline-editor__btn--cancel';
    btnCancel.textContent = '✗ Cancelar';
    btnCancel.type = 'button';
    btnCancel.id = 'geo-inline-cancel';

    actions.append(btnSave, btnCancel);
    wrapper.append(textarea, actions);

    // Copy computed font metrics from the target element
    this._applyFontStyles(textarea, element);

    // Position relative to the preview container
    this._positionOver(wrapper, element);

    this._container.appendChild(wrapper);

    this._el = wrapper;
    this._textarea = textarea;

    // Auto-resize & focus
    this._autoResize();
    textarea.focus();
    textarea.select();

    // Event listeners
    textarea.addEventListener('keydown', this._handleKeydown);
    textarea.addEventListener('input', this._handleInput);
    btnSave.addEventListener('click', () => this._save());
    btnCancel.addEventListener('click', () => this._cancel());
  }

  /**
   * Tear down the editor and clean up DOM / listeners.
   */
  close() {
    if (this._textarea) {
      this._textarea.removeEventListener('keydown', this._handleKeydown);
      this._textarea.removeEventListener('input', this._handleInput);
    }

    if (this._targetElement) {
      this._targetElement.classList.remove('geo-editing');
      this._targetElement = null;
    }

    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }

    this._el = null;
    this._textarea = null;
  }

  /** @returns {boolean} Whether the editor is currently visible */
  get isOpen() {
    return this._el !== null;
  }

  /* ── Private helpers ─────────────────────────────────────── */

  /**
   * Position the wrapper absolutely over `target` inside `_container`.
   * @private
   */
  _positionOver(wrapper, target) {
    const containerRect = this._container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const top = targetRect.top - containerRect.top + this._container.scrollTop;
    const left = targetRect.left - containerRect.left + this._container.scrollLeft;

    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.width = `${Math.max(targetRect.width + 40, 220)}px`;
  }

  /**
   * Copy the font-related computed styles from `source` onto the textarea.
   * @private
   */
  _applyFontStyles(textarea, source) {
    const cs = getComputedStyle(source);
    textarea.style.fontFamily = cs.fontFamily;
    textarea.style.fontSize = cs.fontSize;
    textarea.style.fontWeight = cs.fontWeight;
    textarea.style.lineHeight = cs.lineHeight;
    textarea.style.letterSpacing = cs.letterSpacing;
  }

  /**
   * Auto-resize textarea height to fit content.
   * @private
   */
  _autoResize() {
    const ta = this._textarea;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  /**
   * Keyboard handler.
   * @private
   * @param {KeyboardEvent} e
   */
  _onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._cancel();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this._save();
    }
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
