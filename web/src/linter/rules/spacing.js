/**
 * @module rules/spacing
 * Spacing-related lint rules (CHECK-ONLY).
 * Ported from Python spacing.py.
 *
 * Rules:
 *   - MaxBrRule         (max-br)
 *   - BrBeforeCloseRule (br-before-close)
 *   - BrBetweenBlocksRule (br-between-blocks)
 *   - BrBeforeButtonRule  (br-before-button)
 *   - MaxSpacesRule       (max-spaces)
 */

import { Finding, SEVERITY_WARNING, lineAt, snippetAt } from '../Finding.js';

// ─── MaxBrRule ──────────────────────────────────────────────────────────────

/**
 * Detects runs of more than N consecutive `<br>` tags.
 */
export class MaxBrRule {
  static id = 'max-br';
  static description = 'Too many consecutive <br> tags';
  static severity = SEVERITY_WARNING;

  /**
   * @param {object} [options]
   * @param {number} [options.max=2] - Maximum allowed consecutive `<br>` tags.
   */
  constructor(options = {}) {
    this.options = options;
    this.max = options.max ?? 2;
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    const findings = [];
    const threshold = this.max + 1;
    const pattern = new RegExp(`(?:<br\\s*/?>\\s*){${threshold},}`, 'gi');
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: MaxBrRule.id,
          severity: MaxBrRule.severity,
          message: `More than ${this.max} consecutive <br> tags`,
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}

// ─── BrBeforeCloseRule ──────────────────────────────────────────────────────

/**
 * Detects `<br>` immediately before a closing `</li>`, `</ul>`, `</ol>`, or `</div>`.
 */
export class BrBeforeCloseRule {
  static id = 'br-before-close';
  static description = '<br> before closing block tag';
  static severity = SEVERITY_WARNING;

  /**
   * @param {object} [options]
   * @param {string[]} [options.tags=['li','ul','ol','div']]
   */
  constructor(options = {}) {
    this.options = options;
    this.tags = options.tags ?? ['li', 'ul', 'ol', 'div'];
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    const findings = [];
    const tagGroup = this.tags.join('|');
    const pattern = new RegExp(
      `(?:<br\\s*/?>\\s*)+(</(?:${tagGroup})>)`,
      'gi',
    );
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: BrBeforeCloseRule.id,
          severity: BrBeforeCloseRule.severity,
          message: `<br> before ${m[1]}`,
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}

// ─── BrBetweenBlocksRule ────────────────────────────────────────────────────

/**
 * Detects `<br>` tags placed between closing and opening block elements
 * (`</p>`, `</ul>`, `</ol>` → `<p>`, `<ul>`, `<ol>`).
 */
export class BrBetweenBlocksRule {
  static id = 'br-between-blocks';
  static description = '<br> between block-level elements';
  static severity = SEVERITY_WARNING;

  constructor(options = {}) {
    this.options = options;
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    const findings = [];
    const pattern =
      /(<\/(?:p|ul|ol)>)(\s*(?:<br\s*\/?>\s*)+)(<(?:p|ul|ol)\b)/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: BrBetweenBlocksRule.id,
          severity: BrBetweenBlocksRule.severity,
          message: '<br> between block elements is unnecessary',
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}

// ─── BrBeforeButtonRule ─────────────────────────────────────────────────────

/**
 * Detects `<br>` before a centered `<div>` (typically a submit button).
 */
export class BrBeforeButtonRule {
  static id = 'br-before-button';
  static description = '<br> before centered div (button)';
  static severity = SEVERITY_WARNING;

  constructor(options = {}) {
    this.options = options;
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    const findings = [];
    const pattern =
      /(?:<br\s*\/?>\s*)+(<div[^>]*text-align:\s*center[^>]*>)/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: BrBeforeButtonRule.id,
          severity: BrBeforeButtonRule.severity,
          message: '<br> before centered div button',
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}

// ─── MaxSpacesRule ──────────────────────────────────────────────────────────

/**
 * Detects runs of more than N consecutive spaces (ignoring pure indentation).
 * JS note: uses `(\S) {N+1,}` workaround since variable-length lookbehinds
 * are not universally supported.
 */
export class MaxSpacesRule {
  static id = 'max-spaces';
  static description = 'Too many consecutive spaces';
  static severity = SEVERITY_WARNING;

  /**
   * @param {object} [options]
   * @param {number} [options.max=2] - Maximum allowed consecutive spaces.
   */
  constructor(options = {}) {
    this.options = options;
    this.max = options.max ?? 2;
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    const findings = [];
    const threshold = this.max + 1;
    // Match a non-space character followed by N+1 or more spaces.
    const pattern = new RegExp(`(\\S) {${threshold},}`, 'g');
    let m;
    while ((m = pattern.exec(html)) !== null) {
      // Report starting at the first space (after the \S char).
      const spaceStart = m.index + m[1].length;
      findings.push(
        new Finding({
          ruleId: MaxSpacesRule.id,
          severity: MaxSpacesRule.severity,
          message: `More than ${this.max} consecutive spaces`,
          line: lineAt(html, spaceStart),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}
