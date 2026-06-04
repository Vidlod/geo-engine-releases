/**
 * @fileoverview GEO Engine — HTML Preview with click-to-edit.
 *
 * Renders the engine's current result inside a white `.preview-container`,
 * wraps eligible text nodes in `<span data-geo-editable>` and handles
 * click→InlineEditor→patch→re-render.
 *
 * @module editor/Preview
 */

import { InlineEditor } from './InlineEditor.js';

/** Tag names whose text content must NOT be wrapped. */
const SKIP_TAGS = new Set([
  'STYLE', 'SCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'NOSCRIPT',
]);

/** Tag names whose text children are structural — skip wrapping. */
const STRUCTURAL_TAGS = new Set(['TH']);

export class Preview {
  /**
   * @param {HTMLElement}     containerEl — the `.preview-panel` element
   * @param {import('./Engine.js').Engine} engine
   * @param {() => void}     onEdit — called after every successful edit
   */
  constructor(containerEl, engine, onEdit) {
    /** @private */ this._panel = containerEl;
    /** @private */ this._engine = engine;
    /** @private */ this._onEdit = onEdit;

    /**
     * Map of index → { element, originalText }
     * @private @type {Map<number, {element: HTMLElement, originalText: string}>}
     */
    this._textNodeMap = new Map();

    /** @private @type {HTMLElement|null} */
    this._container = null;

    /** @private @type {InlineEditor|null} */
    this._inlineEditor = null;

    /** @private */ this._handleClick = this._onClick.bind(this);
  }

  /* ── Public API ──────────────────────────────────────────── */

  /**
   * (Re-)render the preview.  Completely rebuilds the inner DOM.
   */
  render() {
    // Tear down previous inline editor
    this._inlineEditor?.close();
    this._inlineEditor = null;

    // Remove old listeners
    if (this._container) {
      this._container.removeEventListener('click', this._handleClick);
    }

    // Build fresh container
    const container = document.createElement('div');
    container.className = 'preview-container';
    container.id = 'geo-preview-container';

    // Inject the engine's current HTML
    container.innerHTML = this._engine.getResult();

    // Wrap editable text nodes
    this._textNodeMap.clear();
    this._wrapTextNodes(container);

    // Activate Bootstrap-style tabs
    this._activateTabs(container);

    // Mount into panel
    this._panel.innerHTML = '';
    this._panel.appendChild(container);
    this._container = container;

    // Delegate clicks
    container.addEventListener('click', this._handleClick);
  }

  /* ── Text-node wrapping ──────────────────────────────────── */

  /**
   * Walk all text nodes inside `root` and wrap each visible one in a
   * `<span data-geo-editable data-geo-index="N">`.
   * @private
   * @param {HTMLElement} root
   */
  _wrapTextNodes(root) {
    let index = 0;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip whitespace-only
          if (!node.textContent || node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip nodes inside banned tags
          let ancestor = node.parentElement;
          while (ancestor && ancestor !== root) {
            if (SKIP_TAGS.has(ancestor.tagName) || STRUCTURAL_TAGS.has(ancestor.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
            ancestor = ancestor.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    // Collect first, then mutate (modifying DOM during walk is unsafe)
    /** @type {{node: Text, text: string}[]} */
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push({ node: /** @type {Text} */ (walker.currentNode), text: walker.currentNode.textContent });
    }

    for (const { node, text } of nodes) {
      const span = document.createElement('span');
      span.setAttribute('data-geo-editable', '');
      span.setAttribute('data-geo-index', String(index));
      span.textContent = text;

      node.parentNode?.replaceChild(span, node);

      this._textNodeMap.set(index, { element: span, originalText: text });
      index++;
    }
  }

  /* ── Click handling ──────────────────────────────────────── */

  /**
   * Delegated click handler.
   * @private
   * @param {MouseEvent} e
   */
  _onClick(e) {
    const span = /** @type {HTMLElement} */ (e.target)?.closest('[data-geo-editable]');
    if (!span) return;

    const idx = Number(span.getAttribute('data-geo-index'));
    const entry = this._textNodeMap.get(idx);
    if (!entry) return;

    // Prevent opening a second editor
    if (this._inlineEditor?.isOpen) {
      this._inlineEditor.close();
    }

    const currentText = span.textContent ?? '';

    this._inlineEditor = new InlineEditor(
      this._container,
      (newText) => {
        // On save
        if (newText !== currentText) {
          try {
            this._engine.addPatch(currentText, newText);
            this.render();        // full re-render with new result
            this._onEdit();       // notify app
          } catch (err) {
            console.error('[Preview] Patch failed:', err);
          }
        }
      },
      () => {
        // On cancel — no-op, editor already closed itself
      },
    );

    this._inlineEditor.open(span, currentText);
  }

  /* ── Tab activation ──────────────────────────────────────── */

  /**
   * Wire up Bootstrap-style `.nav-tabs` → `.tab-pane` interaction.
   * @private
   * @param {HTMLElement} root
   */
  _activateTabs(root) {
    const tabGroups = root.querySelectorAll('.nav-tabs');

    tabGroups.forEach((nav) => {
      const links = /** @type {NodeListOf<HTMLAnchorElement>} */ (
        nav.querySelectorAll('.nav-link')
      );

      // Find the associated tab-content container
      let tabContent = nav.nextElementSibling;
      while (tabContent && !tabContent.classList.contains('tab-content')) {
        tabContent = tabContent.nextElementSibling;
      }
      if (!tabContent) return;

      const panes = tabContent.querySelectorAll('.tab-pane');

      // Ensure the first tab is active by default
      if (links.length && !nav.querySelector('.nav-link.active')) {
        links[0].classList.add('active');
        if (panes.length) panes[0].classList.add('active');
      }

      links.forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();

          // Deactivate all
          links.forEach((l) => l.classList.remove('active'));
          panes.forEach((p) => p.classList.remove('active'));

          // Activate clicked tab
          link.classList.add('active');

          // Find target pane by href or data-target
          const target =
            link.getAttribute('href') ||
            link.getAttribute('data-target') ||
            '';

          if (target && target.startsWith('#')) {
            const pane = tabContent.querySelector(target);
            pane?.classList.add('active');
          } else {
            // Fall back: activate pane at same index
            const idx = Array.from(links).indexOf(link);
            panes[idx]?.classList.add('active');
          }
        });
      });
    });
  }
}
