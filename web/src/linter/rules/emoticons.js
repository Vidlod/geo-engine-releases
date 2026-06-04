/**
 * @module rules/emoticons
 * Emoticon lint rules (CHECK-ONLY).
 * Ported from Python emoticons.py.
 *
 * Rules:
 *   - EmoticonRule (emoticon-span)
 */

import { Finding, SEVERITY_WARNING, lineAt, snippetAt } from '../Finding.js';

// ─── EmoticonRule ───────────────────────────────────────────────────────────

/**
 * Detects bare `(y)` or `(x)` strings that Moodle's text filter converts
 * into emoji.  These should be wrapped in a `<span>` to prevent conversion.
 */
export class EmoticonRule {
  static id = 'emoticon-span';
  static description = 'Bare (y)/(x) will be converted to emoji by Moodle';
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
    const pattern = /\((y|x)\)/g;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: EmoticonRule.id,
          severity: EmoticonRule.severity,
          message: `Bare "(${m[1]})" will be converted to emoji — wrap in <span>`,
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}
