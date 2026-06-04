/**
 * @module Finding
 * Severity constants, Finding class, and helper utilities for the HTML linter.
 * Ported from Python findings.py — CHECK-ONLY, no fix support.
 */

/** @type {string} */
export const SEVERITY_ERROR = 'error';
/** @type {string} */
export const SEVERITY_WARNING = 'warning';
/** @type {string} */
export const SEVERITY_INFO = 'info';

/** @type {Record<string, number>} */
const _SEVERITY_ORDER = {
  [SEVERITY_ERROR]: 0,
  [SEVERITY_WARNING]: 1,
  [SEVERITY_INFO]: 2,
};

/**
 * Represents a single linter finding (diagnostic).
 */
export class Finding {
  /**
   * @param {object} opts
   * @param {string} opts.ruleId   - Identifier of the rule that produced this finding.
   * @param {string} opts.severity - One of SEVERITY_ERROR | SEVERITY_WARNING | SEVERITY_INFO.
   * @param {string} opts.message  - Human-readable description.
   * @param {number} [opts.line=0] - 1-based line number where the issue was found.
   * @param {string} [opts.snippet=''] - Short excerpt of the offending HTML.
   */
  constructor({ ruleId, severity, message, line = 0, snippet = '' }) {
    this.ruleId = ruleId;
    this.severity = severity;
    this.message = message;
    this.line = line;
    this.snippet = snippet;
  }

  /**
   * Returns a tuple-like array for sorting findings by line → severity → ruleId.
   * @returns {[number, number, string]}
   */
  sortKey() {
    return [this.line, _SEVERITY_ORDER[this.severity] ?? 9, this.ruleId];
  }
}

/**
 * Compare two Finding instances for sorting.
 * @param {Finding} a
 * @param {Finding} b
 * @returns {number}
 */
export function compareFinding(a, b) {
  const ka = a.sortKey();
  const kb = b.sortKey();
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Return the 1-based line number for a character position in `html`.
 * @param {string} html - Full HTML string.
 * @param {number} pos  - 0-based character index.
 * @returns {number} 1-based line number.
 */
export function lineAt(html, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < html.length; i++) {
    if (html[i] === '\n') line++;
  }
  return line;
}

/**
 * Extract a short snippet of `html` around the range [start, end).
 * Caps the output at `maxLen` characters.
 * @param {string} html
 * @param {number} start   - 0-based start index.
 * @param {number} end     - 0-based end index (exclusive).
 * @param {number} [maxLen=80] - Maximum snippet length.
 * @returns {string}
 */
export function snippetAt(html, start, end, maxLen = 80) {
  const raw = html.slice(start, end);
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen - 1) + '…';
}
