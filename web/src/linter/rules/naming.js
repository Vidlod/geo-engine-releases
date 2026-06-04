/**
 * @module rules/naming
 * Naming-convention lint rules (CHECK-ONLY).
 * Ported from Python naming.py.
 *
 * Rules:
 *   - ProductoFinalRule (producto-final)
 */

import { Finding, SEVERITY_ERROR, lineAt, snippetAt } from '../Finding.js';

// ─── ProductoFinalRule ──────────────────────────────────────────────────────

/**
 * Detects "Avance N" where N equals the last avance number.
 * The last avance should be labelled "Producto Final" instead.
 *
 * If `last_avance` is not provided in options (or via `config.course`),
 * the rule does nothing and returns an empty array.
 */
export class ProductoFinalRule {
  static id = 'producto-final';
  static description = 'Last avance should be "Producto Final"';
  static severity = SEVERITY_ERROR;

  /**
   * @param {object} [options]
   * @param {number} [options.last_avance] - The number of the last avance.
   */
  constructor(options = {}) {
    this.options = options;
    this.lastAvance = options.last_avance ?? null;
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    if (this.lastAvance == null) return [];

    const findings = [];
    const pattern = new RegExp(`\\bAvance\\s+${this.lastAvance}\\b`, 'g');
    let m;
    while ((m = pattern.exec(html)) !== null) {
      findings.push(
        new Finding({
          ruleId: ProductoFinalRule.id,
          severity: ProductoFinalRule.severity,
          message: `"${m[0]}" should be "Producto Final"`,
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}
