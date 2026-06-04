/**
 * @module linter
 * HTML linter orchestrator (CHECK-ONLY).
 * Ported from Python linter.py.
 *
 * Imports all rule modules, exposes the `ALL_RULES` array and the `Linter` class.
 *
 * Usage:
 * ```js
 * import { Linter } from './linter/index.js';
 *
 * const linter = new Linter({
 *   rules: {
 *     'max-br': { enabled: true, max: 3 },
 *     'elibro-proxy': { enabled: false },
 *   },
 *   course: { last_avance: 5 },
 * });
 *
 * const report = linter.check(html, 'pagina.html');
 * console.log(report.findings);
 * ```
 */

import { compareFinding } from './Finding.js';

// ── Rule imports ────────────────────────────────────────────────────────────
import {
  MaxBrRule,
  BrBeforeCloseRule,
  BrBetweenBlocksRule,
  BrBeforeButtonRule,
  MaxSpacesRule,
} from './rules/spacing.js';

import { LinkTargetRule, ElibroProxyRule } from './rules/links.js';
import { TerminologyRule } from './rules/terminology.js';
import { ParagraphInListRule, ListItemPeriodRule } from './rules/lists.js';
import { TableroAnotacionesRule } from './rules/phrases.js';
import { NoItalicsRule } from './rules/citations.js';
import { EmoticonRule } from './rules/emoticons.js';
import { ProductoFinalRule } from './rules/naming.js';

// ── ALL_RULES ───────────────────────────────────────────────────────────────

/**
 * Master list of every available rule class.
 * Each entry must have a static `id` property.
 * @type {Array<{ id: string, new(options?: object): { check(html: string): import('./Finding.js').Finding[] } }>}
 */
export const ALL_RULES = [
  // spacing
  MaxBrRule,
  BrBeforeCloseRule,
  BrBetweenBlocksRule,
  BrBeforeButtonRule,
  MaxSpacesRule,
  // links
  LinkTargetRule,
  ElibroProxyRule,
  // terminology
  TerminologyRule,
  // lists
  ParagraphInListRule,
  ListItemPeriodRule,
  // phrases
  TableroAnotacionesRule,
  // citations
  NoItalicsRule,
  // emoticons
  EmoticonRule,
  // naming
  ProductoFinalRule,
];

// ── Linter class ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LinterConfig
 * @property {Record<string, { enabled?: boolean, [key: string]: any }>} [rules]
 * @property {{ last_avance?: number }} [course]
 */

/**
 * Orchestrates all enabled rules and collects findings.
 */
export class Linter {
  /**
   * @param {LinterConfig} [config={}]
   */
  constructor(config = {}) {
    /** @type {LinterConfig} */
    this.config = config;

    const rulesConfig = config.rules ?? {};
    const courseConfig = config.course ?? {};

    /** @type {Array<{ check(html: string): import('./Finding.js').Finding[] }>} */
    this.rules = [];

    for (const RuleClass of ALL_RULES) {
      const id = RuleClass.id;
      const ruleOpts = rulesConfig[id] ?? {};

      // A rule is enabled by default unless explicitly disabled.
      if (ruleOpts.enabled === false) continue;

      // Build options object (strip the 'enabled' key).
      const { enabled: _ignored, ...opts } = ruleOpts;

      // Special handling: producto-final gets last_avance from course config
      // if not explicitly set in rule options.
      if (id === 'producto-final' && opts.last_avance == null && courseConfig.last_avance != null) {
        opts.last_avance = courseConfig.last_avance;
      }

      this.rules.push(new RuleClass(opts));
    }
  }

  /**
   * Run all enabled rules against `html` and return a sorted report.
   *
   * @param {string} html     - Full HTML content to lint.
   * @param {string} [filename=''] - Optional filename for the report.
   * @returns {{ filename: string, findings: import('./Finding.js').Finding[] }}
   */
  check(html, filename = '') {
    /** @type {import('./Finding.js').Finding[]} */
    const findings = [];

    for (const rule of this.rules) {
      const results = rule.check(html);
      findings.push(...results);
    }

    findings.sort(compareFinding);

    return { filename, findings };
  }
}

// Re-export core pieces for convenience.
export { Finding, SEVERITY_ERROR, SEVERITY_WARNING, SEVERITY_INFO, lineAt, snippetAt } from './Finding.js';
