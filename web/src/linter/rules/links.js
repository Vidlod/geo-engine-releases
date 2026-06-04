/**
 * @module rules/links
 * Link-related lint rules (CHECK-ONLY).
 * Ported from Python links.py.
 *
 * Rules:
 *   - LinkTargetRule   (link-target)
 *   - ElibroProxyRule  (elibro-proxy)
 */

import { Finding, SEVERITY_ERROR, SEVERITY_WARNING, lineAt, snippetAt } from '../Finding.js';

// ─── LinkTargetRule ─────────────────────────────────────────────────────────

/**
 * Ensures external `<a>` tags have `target="_blank"` and a `rel` attribute.
 * Anchors whose `href` starts with `#` (in-page links) are skipped.
 */
export class LinkTargetRule {
  static id = 'link-target';
  static description = 'External link missing target="_blank" or rel attribute';
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
    const tagPattern = /<a\b([^>]*)>/gi;
    const hrefRe = /href\s*=\s*"(.*?)"/i;
    const targetRe = /target\s*=/i;
    const relRe = /rel\s*=/i;

    let m;
    while ((m = tagPattern.exec(html)) !== null) {
      const attrs = m[1];
      const hrefMatch = hrefRe.exec(attrs);
      const href = hrefMatch ? hrefMatch[1] : '';

      // Skip in-page anchors.
      if (href.startsWith('#')) continue;

      const hasTarget = targetRe.test(attrs);
      const hasRel = relRe.test(attrs);
      const issues = [];

      if (!hasTarget) issues.push('target="_blank"');
      if (!hasRel) issues.push('rel attribute');

      if (issues.length > 0) {
        findings.push(
          new Finding({
            ruleId: LinkTargetRule.id,
            severity: LinkTargetRule.severity,
            message: `Link missing ${issues.join(' and ')}`,
            line: lineAt(html, m.index),
            snippet: snippetAt(html, m.index, m.index + m[0].length),
          }),
        );
      }
    }
    return findings;
  }
}

// ─── ElibroProxyRule ────────────────────────────────────────────────────────

/**
 * Detects the incorrect eLibro proxy domain (missing hyphen).
 * Bad:  `elibronet.ezproxy.udes.edu.co`
 * Good: `elibro-net.ezproxy.udes.edu.co`
 */
export class ElibroProxyRule {
  static id = 'elibro-proxy';
  static description = 'Incorrect eLibro proxy URL (missing hyphen)';
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
    const BAD = 'elibronet.ezproxy.udes.edu.co';
    let pos = 0;

    while (true) {
      const idx = html.indexOf(BAD, pos);
      if (idx === -1) break;

      findings.push(
        new Finding({
          ruleId: ElibroProxyRule.id,
          severity: ElibroProxyRule.severity,
          message:
            'Incorrect eLibro proxy URL — should be elibro-net.ezproxy.udes.edu.co',
          line: lineAt(html, idx),
          snippet: snippetAt(html, idx, idx + BAD.length),
        }),
      );
      pos = idx + BAD.length;
    }
    return findings;
  }
}
