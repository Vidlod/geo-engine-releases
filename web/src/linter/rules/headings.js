/**
 * @module rules/headings
 *
 * StrongHeadingRule — detecta `<strong>` usados como títulos de sección
 * fuera de cualquier elemento de bloque (`<p>`, `<li>`, `<h*>`), seguidos
 * de `<br>`. Este patrón se ve bien en el navegador local pero en Moodle
 * los títulos aparecen pegados sin separación porque `<strong>` es inline.
 *
 * Patrón problemático:
 *   <strong>Unidad 1: Texto</strong><br><br>
 *   <ul>...</ul>
 *   <strong>Unidad 2: Texto</strong><br><br>
 *
 * Solución: envolver cada `<strong>` en `<p>` y eliminar los `<br>` posteriores.
 */

import { Finding, SEVERITY_WARNING, lineAt, snippetAt } from '../Finding.js';

export class StrongHeadingRule {
  static id = 'strong-heading';
  static description =
    '<strong> usado como título fuera de <p> — se verá pegado en Moodle';
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

    // Detect <strong>text</strong> followed by at least one <br>,
    // when preceded by a closing block/list tag or heading tag.
    // This heuristic avoids false positives on inline bold-then-br inside <p>.
    //
    // Pattern: </blockOrHeading> ... <strong>text</strong> <br>
    const pattern =
      /(?:<\/(?:ul|ol|h[1-6]|div|td|th|section|p)>|>\s*\n\s*)(\s*<strong\b[^>]*>[^<]{2,}<\/strong>\s*(?:<br\s*\/?>)+)/gi;

    let m;
    while ((m = pattern.exec(html)) !== null) {
      const matchStart = m.index + (m[0].length - m[1].length);
      findings.push(
        new Finding({
          ruleId: StrongHeadingRule.id,
          severity: StrongHeadingRule.severity,
          message:
            'Título <strong> suelto (sin <p>). Debe ir dentro de un <p>, que ya ' +
            'aporta su propio espacio. Usa el menú del editor (⋮⋮) → "Envolver en <p>".',
          line: lineAt(html, matchStart),
          snippet: snippetAt(html, matchStart, matchStart + Math.min(m[1].length, 80)),
        }),
      );
    }
    return findings;
  }
}
