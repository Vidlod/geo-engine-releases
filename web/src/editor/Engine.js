/**
 * @fileoverview GEO Engine — Patch-based HTML editing core.
 *
 * The engine stores the **original** HTML string exactly as loaded from disk
 * and accumulates lightweight text patches.  `getResult()` replays every
 * patch on the original string using `String.prototype.replace` with a
 * plain-string first-argument (NOT a RegExp) so only the **first**
 * occurrence is replaced — this preserves byte-level structure.
 *
 * Undo/redo: `undo()` moves the newest patch to a redo stack; `redo()`
 * brings it back.  Any new patch clears the redo stack (standard
 * editor semantics).
 *
 * @module editor/Engine
 */

/**
 * A single text-replacement patch.
 * @typedef {Object} Patch
 * @property {string} original    — the exact substring to find
 * @property {string} replacement — the text to substitute
 * @property {string} label       — human-readable description of the change
 */

export class Engine {
  constructor() {
    /** @type {string} The untouched source HTML */
    this.originalHtml = '';

    /** @type {Patch[]} Ordered list of patches (oldest → newest) */
    this.patches = [];

    /** @type {Patch[]} Undone patches available for redo (newest last) */
    this.redoStack = [];
  }

  /* ── Loading ──────────────────────────────────────────────── */

  /**
   * Load (or reload) an HTML string into the engine.
   * Resets all patches.
   * @param {string} html — raw HTML content
   */
  load(html) {
    if (typeof html !== 'string') {
      throw new TypeError('Engine.load() expects a string');
    }
    this.originalHtml = html;
    this.patches = [];
    this.redoStack = [];
  }

  /* ── Patch management ────────────────────────────────────── */

  /**
   * Register a text replacement.
   * @param {string} original    — exact text to match (first occurrence wins)
   * @param {string} replacement — text to substitute
   * @param {string} [label='Edición'] — description shown in the history panel
   * @throws {Error} if `original` cannot be found in the current result
   */
  addPatch(original, replacement, label = 'Edición') {
    if (typeof original !== 'string' || typeof replacement !== 'string') {
      throw new TypeError('addPatch() requires two string arguments');
    }
    if (original === replacement) return; // no-op

    // Validate the substring exists in the *current* composite result
    const current = this.getResult();
    if (!current.includes(original)) {
      throw new Error(
        `addPatch(): target text not found in current HTML.\n` +
        `  Looked for: "${original.slice(0, 80)}${original.length > 80 ? '…' : ''}"`
      );
    }

    this.patches.push({ original, replacement, label });
    this.redoStack = [];
  }

  /**
   * Move the most-recent patch to the redo stack.
   * @returns {Patch|undefined} the undone patch, or `undefined` if none exist
   */
  undo() {
    const patch = this.patches.pop();
    if (patch) this.redoStack.push(patch);
    return patch;
  }

  /**
   * Re-apply the most recently undone patch.
   * @returns {Patch|undefined} the redone patch, or `undefined` if none exist
   */
  redo() {
    const patch = this.redoStack.pop();
    if (patch) this.patches.push(patch);
    return patch;
  }

  /**
   * Undo patches until only the first `count` remain.
   * The undone patches go to the redo stack in order, so `redo()`
   * re-applies them one by one.
   * @param {number} count — how many patches to keep (0 = undo everything)
   * @returns {number} how many patches were undone
   */
  revertTo(count) {
    const target = Math.max(0, Math.min(count, this.patches.length));
    let undone = 0;
    while (this.patches.length > target) {
      this.redoStack.push(/** @type {Patch} */ (this.patches.pop()));
      undone++;
    }
    return undone;
  }

  /**
   * Remove all patches.
   */
  clearPatches() {
    this.patches = [];
    this.redoStack = [];
  }

  /* ── Output ──────────────────────────────────────────────── */

  /**
   * Replay every patch on `originalHtml` and return the composite result.
   *
   * **Important:** `String.prototype.replace(string, string)` replaces only
   * the *first* match — this is intentional and critical for correctness.
   *
   * @returns {string} The fully-patched HTML string
   */
  getResult() {
    let html = this.originalHtml;
    for (const patch of this.patches) {
      html = html.replace(patch.original, patch.replacement);
    }
    return html;
  }

  /* ── Convenience getters ─────────────────────────────────── */

  /** @returns {number} Number of queued patches */
  get patchCount() {
    return this.patches.length;
  }

  /** @returns {boolean} `true` when at least one patch has been applied */
  get isDirty() {
    return this.patches.length > 0;
  }

  /** @returns {boolean} `true` when redo() would re-apply a patch */
  get canRedo() {
    return this.redoStack.length > 0;
  }
}
