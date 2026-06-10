/**
 * @module rules/links
 * Link-related lint rules (CHECK-ONLY).
 * Ported from Python links.py.
 *
 * Rules:
 *   - LinkTargetRule       (link-target)
 *   - ElibroProxyRule      (elibro-proxy)
 *   - ForbiddenSourceRule  (forbidden-source)
 *   - PluginfileRedRule    (pluginfile-red)
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

// ─── ForbiddenSourceRule ────────────────────────────────────────────────────

/**
 * Detects forbidden file sources (regla GEO: los archivos locales van con
 * `@@PLUGINFILE@@`; nunca borradores de Moodle ni nubes externas):
 *   - `draftfile.php`         — borrador temporal de Moodle, el enlace muere.
 *   - OneDrive / SharePoint   — requiere cuenta externa, rompe la trazabilidad.
 */
export class ForbiddenSourceRule {
  static id = 'forbidden-source';
  static description = 'Forbidden file source (draftfile.php / OneDrive / SharePoint)';
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
    const SOURCES = [
      { re: /draftfile\.php/gi, msg: 'Enlace a draftfile.php (borrador temporal) — usa @@PLUGINFILE@@' },
      { re: /(?:1drv\.ms|onedrive\.live\.com|sharepoint\.com|onedrive\.com)/gi, msg: 'Enlace a OneDrive/SharePoint (prohibido) — sube el archivo y usa @@PLUGINFILE@@' },
    ];

    for (const { re, msg } of SOURCES) {
      let m;
      while ((m = re.exec(html)) !== null) {
        findings.push(
          new Finding({
            ruleId: ForbiddenSourceRule.id,
            severity: ForbiddenSourceRule.severity,
            message: msg,
            line: lineAt(html, m.index),
            snippet: snippetAt(html, Math.max(0, m.index - 30), m.index + m[0].length + 30),
          }),
        );
      }
    }
    return findings;
  }
}

// ─── PluginfileRedRule ──────────────────────────────────────────────────────

/**
 * Cross-checks every `@@PLUGINFILE@@/<archivo>` reference against the list of
 * RED filenames registered in the wizard.  Only runs when the list is
 * non-empty (without it there is nothing to compare against).
 *
 * The `redFiles` option is read live on each check, so the app can mutate the
 * same array as the user registers files.
 */
export class PluginfileRedRule {
  static id = 'pluginfile-red';
  static description = '@@PLUGINFILE@@ reference does not match any registered RED file';
  static severity = SEVERITY_WARNING;

  /**
   * @param {object} [options]
   * @param {string[]} [options.redFiles=[]] - Known RED filenames (live reference).
   */
  constructor(options = {}) {
    this.options = options;
    this.redFiles = options.redFiles ?? [];
  }

  /** Normalise a filename for comparison. @param {string} name */
  static norm(name) {
    let n = name;
    try { n = decodeURIComponent(n); } catch { /* keep raw */ }
    return n.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * @param {string} html
   * @returns {Finding[]}
   */
  check(html) {
    const findings = [];
    if (!this.redFiles || this.redFiles.length === 0) return findings;

    const known = new Set(this.redFiles.map(PluginfileRedRule.norm));
    const pattern = /@@PLUGINFILE@@\/([^"'<>\s?#]+)/g;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      const name = PluginfileRedRule.norm(m[1]);
      if (known.has(name)) continue;

      findings.push(
        new Finding({
          ruleId: PluginfileRedRule.id,
          severity: PluginfileRedRule.severity,
          message: `"${m[1]}" no coincide con ningún archivo RED registrado — revisa el nombre exacto`,
          line: lineAt(html, m.index),
          snippet: snippetAt(html, m.index, m.index + m[0].length),
        }),
      );
    }
    return findings;
  }
}
