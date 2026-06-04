/**
 * @module rules/phrases
 * Prohibited-phrase lint rules (CHECK-ONLY).
 * Ported from Python phrases.py.
 *
 * Rules:
 *   - TableroAnotacionesRule (tablero-anotaciones)
 */

import { Finding, SEVERITY_ERROR, lineAt, snippetAt } from '../Finding.js';

// ─── TableroAnotacionesRule ─────────────────────────────────────────────────

/**
 * Detects the prohibited phrase "a través del / en el tablero de anotaciones"
 * which should not appear in course pages.
 */
export class TableroAnotacionesRule {
  static id = 'tablero-anotaciones';
  static description = 'Prohibited phrase "tablero de anotaciones"';
  static severity = SEVERITY_ERROR;

  constructor(options = {}) {
    this.options = options;
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    const findings = [];
    const pattern = /\s*(?:a través del|en el)\s+tablero de anotaciones/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: TableroAnotacionesRule.id,
          severity: TableroAnotacionesRule.severity,
          message: 'Prohibited phrase: "tablero de anotaciones"',
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}
