/**
 * @module rules/terminology
 * Terminology lint rules (CHECK-ONLY).
 * Ported from Python terminology.py.
 *
 * Rules:
 *   - TerminologyRule (terminology-module)
 */

import { Finding, SEVERITY_WARNING, lineAt, snippetAt } from '../Finding.js';

// ─── TerminologyRule ────────────────────────────────────────────────────────

/**
 * Detects use of "módulo / Módulo / módulos / Módulos" which should be
 * replaced with "curso / cursos" in UDES course pages.
 */
export class TerminologyRule {
  static id = 'terminology-module';
  static description = 'Use "curso" instead of "módulo"';
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
    const pattern = /\b[Mm]ódulos?\b/g;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: TerminologyRule.id,
          severity: TerminologyRule.severity,
          message: `"${m[0]}" should be "curso${m[0].endsWith('s') ? 's' : ''}"`,
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}
