/**
 * @fileoverview GEO Engine — Patch-based HTML editing core.
 *
 * The engine stores the **original** HTML string exactly as loaded from disk
 * and accumulates lightweight text patches.  `getResult()` replays every
 * patch on the original string using `String.prototype.replace` with a
 * plain-string first-argument (NOT a RegExp) so only the **first**
 * occurrence is replaced — this preserves byte-level structure.
 *
 * @module editor/Engine
 */

/**
 * A single text-replacement patch.
 * @typedef {Object} Patch
 * @property {string} original   — the exact substring to find
 * @property {string} replacement — the text to substitute
 */

export class Engine {
  constructor() {
    /** @type {string} The untouched source HTML */
    this.originalHtml = '';

    /** @type {Patch[]} Ordered list of patches (oldest → newest) */
    this.patches = [];
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
  }

  /* ── Patch management ────────────────────────────────────── */

  /**
   * Register a text replacement.
   * @param {string} original    — exact text to match (first occurrence wins)
   * @param {string} replacement — text to substitute
   * @throws {Error} if `original` cannot be found in the current result
   */
  addPatch(original, replacement) {
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

    this.patches.push({ original, replacement });
  }

  /**
   * Remove and return the most-recent patch, or `undefined` if none exist.
   * @returns {Patch|undefined}
   */
  undo() {
    return this.patches.pop();
  }

  /**
   * Remove all patches.
   */
  clearPatches() {
    this.patches = [];
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
}
