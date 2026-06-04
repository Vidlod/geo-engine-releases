/**
 * @fileoverview GEO Engine — Linter findings sidebar panel.
 *
 * Renders linter findings as cards in a collapsible sidebar.
 * When there are no findings, shows a ✓ empty state.
 *
 * @module ui/LinterPanel
 */

export class LinterPanel {
  /**
   * @param {HTMLElement} containerEl — the `.linter-sidebar` element
   */
  constructor(containerEl) {
    /** @private */ this._el = containerEl;
    /** @private @type {HTMLElement|null} */ this._listEl = null;
    /** @private @type {HTMLElement|null} */ this._headerCountEl = null;
  }

  /* ── Public API ──────────────────────────────────────────── */

  /**
   * Build the sidebar shell (header + scrollable list area).
   * Call this once at startup.
   */
  init() {
    this._el.innerHTML = '';
    this._el.className = 'linter-sidebar';
    this._el.id = 'geo-linter-sidebar';

    // Header
    const header = document.createElement('div');
    header.className = 'linter-sidebar__header';

    const title = document.createElement('div');
    title.className = 'linter-sidebar__title';
    title.textContent = 'Linter';

    const count = document.createElement('span');
    count.className = 'linter-sidebar__count linter-sidebar__count--success';
    count.id = 'geo-linter-count';
    count.textContent = '0';
    this._headerCountEl = count;

    title.appendChild(count);
    header.appendChild(title);

    // List
    const list = document.createElement('div');
    list.className = 'linter-sidebar__list';
    list.id = 'geo-linter-list';
    this._listEl = list;

    this._el.append(header, list);

    // Show empty state by default
    this._showEmpty();
  }

  /**
   * Render a list of linter findings.
   * @param {Array<{rule_id: string, severity: string, message: string, line: number, snippet?: string}>} findings
   */
  render(findings) {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';

    if (!findings || findings.length === 0) {
      this._showEmpty();
      this._updateCount(0, 0);
      return;
    }

    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;
    this._updateCount(errors, warnings);

    for (const finding of findings) {
      this._listEl.appendChild(this._createCard(finding));
    }
  }

  /** Toggle sidebar visibility. */
  toggle() {
    this._el.classList.toggle('linter-sidebar--collapsed');
  }

  /** Show the sidebar. */
  show() {
    this._el.classList.remove('linter-sidebar--collapsed');
  }

  /** Hide the sidebar. */
  hide() {
    this._el.classList.add('linter-sidebar--collapsed');
  }

  /* ── Private helpers ─────────────────────────────────────── */

  /**
   * Render the empty state.
   * @private
   */
  _showEmpty() {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';

    const empty = document.createElement('div');
    empty.className = 'linter-sidebar__empty';

    const icon = document.createElement('div');
    icon.className = 'linter-sidebar__empty-icon';
    icon.textContent = '✓';

    const text = document.createElement('div');
    text.className = 'linter-sidebar__empty-text';
    text.textContent = 'Sin hallazgos';

    empty.append(icon, text);
    this._listEl.appendChild(empty);
  }

  /**
   * Update the header count badge.
   * @private
   * @param {number} errors
   * @param {number} warnings
   */
  _updateCount(errors, warnings) {
    if (!this._headerCountEl) return;
    const total = errors + warnings;
    this._headerCountEl.textContent = String(total);

    // Reset variant classes
    this._headerCountEl.className = 'linter-sidebar__count';
    if (errors > 0) {
      this._headerCountEl.classList.add('linter-sidebar__count--error');
    } else if (warnings > 0) {
      this._headerCountEl.classList.add('linter-sidebar__count--warning');
    } else {
      this._headerCountEl.classList.add('linter-sidebar__count--success');
    }
  }

  /**
   * Create a single finding card.
   * @private
   * @param {{rule_id: string, severity: string, message: string, line: number, snippet?: string}} f
   * @returns {HTMLElement}
   */
  _createCard(f) {
    const card = document.createElement('div');
    card.className = 'finding-card';

    // Header row: severity dot + rule id + line number
    const header = document.createElement('div');
    header.className = 'finding-card__header';

    const dot = document.createElement('span');
    dot.className = `finding-card__severity finding-card__severity--${f.severity}`;

    const rule = document.createElement('span');
    rule.className = 'finding-card__rule';
    rule.textContent = f.rule_id;

    const line = document.createElement('span');
    line.className = 'finding-card__line';
    line.textContent = `L${f.line}`;

    header.append(dot, rule, line);

    // Message
    const message = document.createElement('div');
    message.className = 'finding-card__message';
    message.textContent = f.message;

    card.append(header, message);

    // Optional snippet
    if (f.snippet) {
      const snippet = document.createElement('div');
      snippet.className = 'finding-card__snippet';
      snippet.textContent = f.snippet;
      card.appendChild(snippet);
    }

    return card;
  }
}
