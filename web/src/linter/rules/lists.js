/**
 * @module rules/lists
 * List-related lint rules (CHECK-ONLY).
 * Ported from Python lists.py.
 *
 * Rules:
 *   - ParagraphInListRule (li-paragraph)
 *   - ListItemPeriodRule  (li-period)
 */

import { Finding, SEVERITY_WARNING, lineAt, snippetAt } from '../Finding.js';

/**
 * Check whether a `<li>` is a navigation item (Bootstrap tabs, nav pills, etc.).
 * Such items are excluded from list content rules.
 * @param {string} attrs - The attribute string of the <li> tag.
 * @param {string} inner - The inner HTML of the <li>.
 * @returns {boolean}
 */
function isNavItem(attrs, inner) {
  const combined = attrs + ' ' + inner;
  return (
    /nav-item/i.test(combined) ||
    /nav-link/i.test(combined) ||
    /role\s*=\s*"tab"/i.test(combined) ||
    /data-toggle\s*=\s*"tab"/i.test(combined)
  );
}

/**
 * Check whether the inner HTML contains media elements that make
 * punctuation checking irrelevant.
 * @param {string} inner
 * @returns {boolean}
 */
function hasMedia(inner) {
  return /<(?:audio|button|img|iframe|video)\b/i.test(inner);
}

/**
 * Strip all HTML tags from a string.
 * @param {string} html
 * @returns {string}
 */
function stripTags(html) {
  return html.replace(/<[^>]*>/g, '');
}

// ─── ParagraphInListRule ────────────────────────────────────────────────────

/**
 * Detects `<p>` tags inside `<li>` items, which cause extra spacing.
 * Excludes navigation items (tabs, nav-pills, etc.).
 */
export class ParagraphInListRule {
  static id = 'li-paragraph';
  static description = '<p> inside <li> causes extra spacing';
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
    const liPattern = /<li\b([^>]*)>(.*?)<\/li>/gis;
    let m;
    while ((m = liPattern.exec(html)) !== null) {
      const attrs = m[1];
      const inner = m[2];

      if (isNavItem(attrs, inner)) continue;

      if (/<p\b/i.test(inner)) {
        findings.push(
          new Finding({
            ruleId: ParagraphInListRule.id,
            severity: ParagraphInListRule.severity,
            message: '<p> found inside <li>',
            line: lineAt(html, m.index),
            snippet: snippetAt(html, m.index, m.index + m[0].length),
          }),
        );
      }
    }
    return findings;
  }
}

// ─── ListItemPeriodRule ─────────────────────────────────────────────────────

/**
 * Checks that each `<li>` text content ends with proper punctuation
 * (`.`, `:`, `?`, or `!`).  Excludes nav items and items containing
 * media elements (audio, button, img, iframe, video).
 */
export class ListItemPeriodRule {
  static id = 'li-period';
  static description = 'List item text should end with punctuation';
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
    const liPattern = /<li\b([^>]*)>(.*?)<\/li>/gis;
    let m;
    while ((m = liPattern.exec(html)) !== null) {
      const attrs = m[1];
      const inner = m[2];

      if (isNavItem(attrs, inner)) continue;
      if (hasMedia(inner)) continue;

      const text = stripTags(inner).trim();
      if (text.length === 0) continue;

      const lastChar = text[text.length - 1];
      if (!'.?!:'.includes(lastChar)) {
        findings.push(
          new Finding({
            ruleId: ListItemPeriodRule.id,
            severity: ListItemPeriodRule.severity,
            message: `List item does not end with punctuation (ends with "${lastChar}")`,
            line: lineAt(html, m.index),
            snippet: snippetAt(html, m.index, m.index + m[0].length),
          }),
        );
      }
    }
    return findings;
  }
}
