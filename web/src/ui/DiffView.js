/**
 * @fileoverview GEO Engine — Diff view (original vs resultado).
 *
 * Read-only line diff between `engine.originalHtml` and `engine.getResult()`.
 * Pure render: never touches the engine or the patches.
 *
 * The diff trims the common prefix/suffix first, so the LCS only runs on the
 * changed middle region — patches are local, so this stays tiny even for
 * large documents.
 *
 * @module ui/DiffView
 */

/**
 * @typedef {{ type: 'ctx'|'del'|'add', aLine: number|null, bLine: number|null, text: string }} DiffOp
 */

/**
 * Compute a line-level diff between two strings.
 * @param {string} a — original text
 * @param {string} b — modified text
 * @returns {DiffOp[]}
 */
export function computeLineDiff(a, b) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');

  // ── Trim common prefix/suffix ──
  let start = 0;
  while (start < aLines.length && start < bLines.length && aLines[start] === bLines[start]) start++;

  let aEnd = aLines.length;
  let bEnd = bLines.length;
  while (aEnd > start && bEnd > start && aLines[aEnd - 1] === bLines[bEnd - 1]) { aEnd--; bEnd--; }

  /** @type {DiffOp[]} */
  const ops = [];
  for (let i = 0; i < start; i++) {
    ops.push({ type: 'ctx', aLine: i + 1, bLine: i + 1, text: aLines[i] });
  }

  // ── LCS over the changed middle region ──
  const mid = lcsDiff(aLines.slice(start, aEnd), bLines.slice(start, bEnd));
  for (const op of mid) {
    ops.push({
      type: op.type,
      aLine: op.aLine === null ? null : op.aLine + start,
      bLine: op.bLine === null ? null : op.bLine + start,
      text: op.text,
    });
  }

  for (let i = aEnd; i < aLines.length; i++) {
    const offset = i - aEnd;
    ops.push({ type: 'ctx', aLine: i + 1, bLine: bEnd + offset + 1, text: aLines[i] });
  }

  return ops;
}

/**
 * Classic LCS diff over two (small) arrays of lines.
 * Line numbers in the result are 1-based and relative to the inputs.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {DiffOp[]}
 */
function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;

  // DP table of LCS lengths
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  /** @type {DiffOp[]} */
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'ctx', aLine: i + 1, bLine: j + 1, text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', aLine: i + 1, bLine: null, text: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', aLine: null, bLine: j + 1, text: b[j] });
      j++;
    }
  }
  while (i < n) { ops.push({ type: 'del', aLine: i + 1, bLine: null, text: a[i] }); i++; }
  while (j < m) { ops.push({ type: 'add', aLine: null, bLine: j + 1, text: b[j] }); j++; }

  return ops;
}

/**
 * Group diff ops into hunks: changed runs plus `context` surrounding lines.
 * Unchanged stretches in between collapse into a separator.
 * @param {DiffOp[]} ops
 * @param {number} [context=3]
 * @returns {Array<DiffOp[]>} hunks (arrays of consecutive ops to show)
 */
export function buildHunks(ops, context = 3) {
  const keep = new Array(ops.length).fill(false);
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type === 'ctx') continue;
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) {
      keep[k] = true;
    }
  }

  /** @type {Array<DiffOp[]>} */
  const hunks = [];
  let current = null;
  for (let i = 0; i < ops.length; i++) {
    if (!keep[i]) { current = null; continue; }
    if (!current) { current = []; hunks.push(current); }
    current.push(ops[i]);
  }
  return hunks;
}

/* ── View ─────────────────────────────────────────────────── */

export class DiffView {
  /**
   * @param {HTMLElement} containerEl — panel that hosts the diff overlay
   */
  constructor(containerEl) {
    /** @private */ this._panel = containerEl;
    /** @private @type {HTMLElement|null} */ this._el = null;
  }

  get isOpen() { return this._el !== null; }

  /**
   * Render (or re-render) the diff overlay.
   * @param {string} originalHtml
   * @param {string} resultHtml
   */
  render(originalHtml, resultHtml) {
    this.close();

    const el = document.createElement('div');
    el.className = 'diff-view';
    el.id = 'geo-diff-view';

    const ops = computeLineDiff(originalHtml, resultHtml);
    const hunks = buildHunks(ops);

    const added = ops.filter((o) => o.type === 'add').length;
    const removed = ops.filter((o) => o.type === 'del').length;

    const head = document.createElement('div');
    head.className = 'diff-view__head';
    head.innerHTML =
      `<span class="diff-view__title">Original → Resultado</span>` +
      `<span class="diff-view__stat diff-view__stat--add">+${added}</span>` +
      `<span class="diff-view__stat diff-view__stat--del">−${removed}</span>`;
    el.appendChild(head);

    const body = document.createElement('div');
    body.className = 'diff-view__body';

    if (hunks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'diff-view__empty';
      empty.textContent = 'Sin diferencias — el resultado es idéntico al original.';
      body.appendChild(empty);
    }

    hunks.forEach((hunk, idx) => {
      if (idx > 0) {
        const sep = document.createElement('div');
        sep.className = 'diff-view__sep';
        sep.textContent = '⋯';
        body.appendChild(sep);
      }
      for (const op of hunk) {
        const row = document.createElement('div');
        row.className = `diff-line diff-line--${op.type}`;

        const numA = document.createElement('span');
        numA.className = 'diff-line__num';
        numA.textContent = op.aLine === null ? '' : String(op.aLine);

        const numB = document.createElement('span');
        numB.className = 'diff-line__num';
        numB.textContent = op.bLine === null ? '' : String(op.bLine);

        const sign = document.createElement('span');
        sign.className = 'diff-line__sign';
        sign.textContent = op.type === 'add' ? '+' : op.type === 'del' ? '−' : ' ';

        const text = document.createElement('span');
        text.className = 'diff-line__text';
        text.textContent = op.text;

        row.append(numA, numB, sign, text);
        body.appendChild(row);
      }
    });

    el.appendChild(body);
    this._panel.appendChild(el);
    this._el = el;
  }

  /** Remove the overlay. */
  close() {
    this._el?.remove();
    this._el = null;
  }
}
