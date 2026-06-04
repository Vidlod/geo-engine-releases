/**
 * @module rules/citations
 * Citation / italics lint rules (CHECK-ONLY).
 * Ported from Python citations.py.
 *
 * Rules:
 *   - NoItalicsRule (no-italics)
 */

import { Finding, SEVERITY_WARNING, SEVERITY_INFO, lineAt, snippetAt } from '../Finding.js';

// ─── NoItalicsRule ──────────────────────────────────────────────────────────

/**
 * Detects italic formatting that may indicate non-APA citation style:
 *   - `<em>` tags
 *   - Inline `font-style: italic`
 *   - `<i>` tags (reported as info — may be an icon)
 */
export class NoItalicsRule {
  static id = 'no-italics';
  static description = 'Italic formatting detected (review citations)';
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

    // 1. <em> tags (opening or closing).
    const emPattern = /<\/?em\b[^>]*>/gi;
    let m;
    while ((m = emPattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: NoItalicsRule.id,
          severity: SEVERITY_WARNING,
          message: '<em> tag found — review for citation compliance',
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }

    // 2. Inline font-style: italic.
    const stylePattern = /font-style\s*:\s*italic\s*;?/gi;
    while ((m = stylePattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: NoItalicsRule.id,
          severity: SEVERITY_WARNING,
          message: 'font-style:italic found — review for citation compliance',
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }

    // 3. <i> tags — could be icons (Font Awesome, etc.).
    const iPattern = /<\/?i\b[^>]*>/gi;
    while ((m = iPattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: NoItalicsRule.id,
          severity: SEVERITY_INFO,
          message: '<i> tag found — review manually (icon?)',
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }

    return findings;
  }
}
