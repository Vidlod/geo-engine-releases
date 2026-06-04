/**
 * @fileoverview GEO Engine — HTML Preview with block-level editing.
 *
 * Renders the engine's current result inside a `.preview-container`.
 *
 * Editing model:
 *  • **Text editing**: click on any text span → InlineEditor opens for that text.
 *  • **Block operations**: hover over a `<p>` or `<li>` → a floating toolbar
 *    appears with Merge ↑ / Split / Merge ↓ buttons.
 *
 * @module editor/Preview
 */

import { InlineEditor } from './InlineEditor.js';
import { splitBlock, mergeBlocks, findBlock } from './BlockOps.js';

/** Tags whose text content must NOT be wrapped. */
const SKIP_TAGS = new Set([
  'STYLE', 'SCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'NOSCRIPT',
]);

/** Tags whose text children are structural — skip wrapping. */
const STRUCTURAL_TAGS = new Set(['TH']);

/** Tags that count as "blocks" for merge/split. */
const BLOCK_TAGS = ['P', 'LI'];

export class Preview {
  /**
   * @param {HTMLElement}                     containerEl
   * @param {import('./Engine.js').Engine}    engine
   * @param {() => void}                     onEdit
   */
  constructor(containerEl, engine, onEdit) {
    /** @private */ this._panel = containerEl;
    /** @private */ this._engine = engine;
    /** @private */ this._onEdit = onEdit;

    /** @private @type {Map<number, {element: HTMLElement, originalText: string}>} */
    this._textNodeMap = new Map();

    /** @private @type {HTMLElement|null} */
    this._container = null;

    /** @private @type {InlineEditor|null} */
    this._inlineEditor = null;

    /** @private @type {HTMLElement|null} — the block toolbar DOM */
    this._blockToolbar = null;

    /** @private @type {HTMLElement|null} — currently hovered block */
    this._activeBlock = null;

    /** @private */ this._handleClick = this._onClick.bind(this);
  }

  /* ═══════════════════════════════════════════════════════════
     Public API
     ═══════════════════════════════════════════════════════════ */

  /** (Re-)render the preview.  Completely rebuilds the inner DOM. */
  render() {
    this._inlineEditor?.close();
    this._inlineEditor = null;

    // ── Save active tab state before destroying the DOM ──
    const activeTabHrefs = this._saveTabState();

    if (this._container) {
      this._container.removeEventListener('click', this._handleClick);
    }

    const container = document.createElement('div');
    container.className = 'preview-container';
    container.id = 'geo-preview-container';
    container.innerHTML = this._engine.getResult();

    // Wrap text nodes for inline editing
    this._textNodeMap.clear();
    this._wrapTextNodes(container);

    // Block toolbar (merge / split / clean br)
    this._setupBlockToolbar(container);

    // Bootstrap tabs
    this._activateTabs(container);

    // ── Restore active tab state ──
    this._restoreTabState(container, activeTabHrefs);

    // Mount
    this._panel.innerHTML = '';
    this._panel.appendChild(container);
    this._container = container;

    container.addEventListener('click', this._handleClick);
  }

  /**
   * Record which tabs are active before a re-render.
   * @private
   * @returns {string[]}
   */
  _saveTabState() {
    if (!this._container) return [];
    const hrefs = [];
    this._container.querySelectorAll('.nav-link.active').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) hrefs.push(href);
    });
    return hrefs;
  }

  /**
   * Re-activate tabs that were active before the re-render.
   * @private
   * @param {HTMLElement} root
   * @param {string[]}    hrefs
   */
  _restoreTabState(root, hrefs) {
    if (!hrefs.length) return;
    for (const href of hrefs) {
      const link = root.querySelector(
        `[data-toggle="tab"][href="${href}"],` +
        `[data-toggle="pill"][href="${href}"],` +
        `[data-bs-toggle="tab"][href="${href}"],` +
        `[data-bs-toggle="pill"][href="${href}"]`
      );
      if (link) link.click();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Text-node wrapping (for inline text editing)
     ═══════════════════════════════════════════════════════════ */

  /** @private */
  _wrapTextNodes(root) {
    let index = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent || node.textContent.trim().length === 0)
          return NodeFilter.FILTER_REJECT;

        let ancestor = node.parentElement;
        while (ancestor && ancestor !== root) {
          if (SKIP_TAGS.has(ancestor.tagName) || STRUCTURAL_TAGS.has(ancestor.tagName))
            return NodeFilter.FILTER_REJECT;
          ancestor = ancestor.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

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

  /* ═══════════════════════════════════════════════════════════
     Inline text click handler
     ═══════════════════════════════════════════════════════════ */

  /** @private */
  _onClick(e) {
    const span = /** @type {HTMLElement} */ (e.target)?.closest('[data-geo-editable]');
    if (!span) return;

    const idx = Number(span.getAttribute('data-geo-index'));
    const entry = this._textNodeMap.get(idx);
    if (!entry) return;

    if (this._inlineEditor?.isOpen) this._inlineEditor.close();

    const currentText = span.textContent ?? '';

    this._inlineEditor = new InlineEditor(
      this._container,
      (newText) => {
        if (newText !== currentText) {
          try {
            this._engine.addPatch(currentText, newText);
            this.render();
            this._onEdit();
          } catch (err) { console.error('[Preview] Patch failed:', err); }
        }
      },
      () => { /* cancel */ },
    );

    this._inlineEditor.open(span, currentText);
  }

  /* ═══════════════════════════════════════════════════════════
     Block toolbar  (merge / split)
     ═══════════════════════════════════════════════════════════ */

  /** @private */
  _setupBlockToolbar(root) {
    // ── Create toolbar DOM ──
    const tb = document.createElement('div');
    tb.className = 'block-toolbar';
    tb.innerHTML = `
      <button class="block-toolbar__btn block-toolbar__btn--merge"
              data-action="merge-up"  title="Unir con el párrafo anterior">⬆ Unir</button>
      <button class="block-toolbar__btn block-toolbar__btn--clean"
              data-action="clean-br"  title="Quitar saltos de línea (<br>) dentro del párrafo">⊟ Quitar saltos</button>
      <button class="block-toolbar__btn block-toolbar__btn--split"
              data-action="split"     title="Separar este párrafo en dos">✂ Separar</button>
      <button class="block-toolbar__btn block-toolbar__btn--merge"
              data-action="merge-down" title="Unir con el párrafo siguiente">⬇ Unir</button>
    `;
    tb.style.display = 'none';
    root.appendChild(tb);
    this._blockToolbar = tb;
    this._activeBlock = null;

    // ── Hover detection on block elements ──
    root.addEventListener('mouseover', (e) => {
      if (this._inlineEditor?.isOpen) return;
      const target = /** @type {HTMLElement} */ (e.target);
      const block = target.closest('p, li');
      if (!block || block === this._activeBlock) return;

      // Skip nav items and items inside tab navs
      if (block.closest('.nav, .nav-tabs, .nav-pills')) return;

      this._activeBlock = /** @type {HTMLElement} */ (block);
      this._positionToolbar(tb, /** @type {HTMLElement} */ (block));
      tb.style.display = 'flex';

      // Update button visibility based on context
      const prevBtn = tb.querySelector('[data-action="merge-up"]');
      const nextBtn = tb.querySelector('[data-action="merge-down"]');
      const cleanBtn = tb.querySelector('[data-action="clean-br"]');
      const hasPrev = !!this._findAdjacentBlock(/** @type {HTMLElement} */ (block), 'prev');
      const hasNext = !!this._findAdjacentBlock(/** @type {HTMLElement} */ (block), 'next');
      const hasBr = !!block.querySelector('br');
      if (prevBtn)  /** @type {HTMLElement} */ (prevBtn).style.display  = hasPrev ? '' : 'none';
      if (nextBtn)  /** @type {HTMLElement} */ (nextBtn).style.display  = hasNext ? '' : 'none';
      if (cleanBtn) /** @type {HTMLElement} */ (cleanBtn).style.display = hasBr   ? '' : 'none';
    });

    // ── Hide on mouse leave ──
    const hideCheck = () => {
      setTimeout(() => {
        if (tb.matches(':hover')) return;
        if (this._activeBlock?.matches(':hover')) return;
        tb.style.display = 'none';
        this._activeBlock = null;
      }, 150);
    };

    root.addEventListener('mouseleave', hideCheck);
    tb.addEventListener('mouseleave', hideCheck);

    // ── Button clicks ──
    tb.addEventListener('click', (e) => {
      const btn = /** @type {HTMLElement} */ (e.target).closest('[data-action]');
      if (!btn || !this._activeBlock) return;

      e.preventDefault();
      e.stopPropagation();

      const action = btn.getAttribute('data-action');
      const blockEl = this._activeBlock;
      tb.style.display = 'none';

      if (action === 'merge-up') this._doMerge(blockEl, 'up');
      else if (action === 'merge-down') this._doMerge(blockEl, 'down');
      else if (action === 'split') this._doSplit(blockEl);
      else if (action === 'clean-br') this._doCleanBr(blockEl);

      this._activeBlock = null;
    });
  }

  /** @private */
  _positionToolbar(toolbar, block) {
    const containerRect = this._container.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();

    const top = blockRect.top - containerRect.top + this._container.scrollTop - 4;
    toolbar.style.top = `${top}px`;
    toolbar.style.right = '100%';
    toolbar.style.left = 'auto';
    toolbar.style.marginRight = '8px';
  }

  /* ── Merge implementation ──────────────────────────────── */

  /** @private */
  _doMerge(blockEl, direction) {
    const tagName = blockEl.tagName.toLowerCase();
    const other = this._findAdjacentBlock(blockEl, direction === 'up' ? 'prev' : 'next');
    if (!other) return;

    // Determine which is "prev" and which is "curr" (curr gets absorbed into prev)
    const prevEl = direction === 'up' ? other : blockEl;
    const currEl = direction === 'up' ? blockEl : other;

    const prevText = this._norm(prevEl.textContent);
    const currText = this._norm(currEl.textContent);

    const html = this._engine.getResult();
    const patch = mergeBlocks(html, currText, prevText, tagName);

    if (patch) {
      try {
        this._engine.addPatch(patch.original, patch.replacement);
        this.render();
        this._onEdit();
      } catch (err) {
        console.error('[Preview] Merge failed:', err);
      }
    } else {
      console.warn('[Preview] mergeBlocks returned null for:', { prevText, currText, tagName });
    }
  }

  /* ── Clean BR implementation ───────────────────────────── */

  /** Remove all `<br>` tags inside a block element. @private */
  _doCleanBr(blockEl) {
    const tagName = blockEl.tagName.toLowerCase();
    const blockText = this._norm(blockEl.textContent);

    const html = this._engine.getResult();
    const block = findBlock(html, blockText, tagName);
    if (!block) {
      console.warn('[Preview] _doCleanBr: could not find block.');
      return;
    }

    // Remove <br> variants (and collapse surrounding whitespace to a single space)
    const cleanInner = block.innerHTML
      .replace(/\s*<br\s*\/?>\s*/gi, ' ');

    if (cleanInner === block.innerHTML) return; // nothing changed

    const original = block.fullMatch;
    const replacement = `<${tagName}${block.attrs}>${cleanInner}</${tagName}>`;

    try {
      this._engine.addPatch(original, replacement);
      this.render();
      this._onEdit();
    } catch (err) {
      console.error('[Preview] Clean BR failed:', err);
    }
  }

  /* ── Split implementation ──────────────────────────────── */

  /** @private */
  _doSplit(blockEl) {
    const tagName = blockEl.tagName.toLowerCase();
    const blockText = this._norm(blockEl.textContent);

    // Close any existing editor
    if (this._inlineEditor?.isOpen) this._inlineEditor.close();

    // Show the full paragraph text in a large textarea with split instructions
    this._showSplitEditor(blockEl, blockText, tagName);
  }

  /**
   * Opens a textarea over the paragraph with the full text for splitting.
   * @private
   */
  _showSplitEditor(blockEl, blockText, tagName) {
    // Create the split overlay
    const overlay = document.createElement('div');
    overlay.className = 'split-editor';

    const hint = document.createElement('div');
    hint.className = 'split-editor__hint';
    hint.textContent = 'Coloca el cursor donde quieras separar y presiona el botón:';

    const textarea = document.createElement('textarea');
    textarea.className = 'split-editor__textarea';
    textarea.value = blockText;
    textarea.rows = 4;

    const actions = document.createElement('div');
    actions.className = 'split-editor__actions';

    const btnSplit = document.createElement('button');
    btnSplit.className = 'split-editor__btn split-editor__btn--confirm';
    btnSplit.textContent = '✂ Separar aquí';
    btnSplit.type = 'button';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'split-editor__btn split-editor__btn--cancel';
    btnCancel.textContent = '✗ Cancelar';
    btnCancel.type = 'button';

    actions.append(btnSplit, btnCancel);
    overlay.append(hint, textarea, actions);

    // Position over the block element
    const containerRect = this._container.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();
    overlay.style.top = `${blockRect.top - containerRect.top + this._container.scrollTop}px`;
    overlay.style.left = `${blockRect.left - containerRect.left}px`;
    overlay.style.width = `${blockRect.width}px`;

    this._container.appendChild(overlay);
    textarea.focus();

    // Handle split
    btnSplit.addEventListener('click', () => {
      const cursorPos = textarea.selectionStart;
      overlay.remove();

      if (cursorPos <= 0 || cursorPos >= blockText.length) {
        console.warn('[Preview] Split position at boundary, ignoring.');
        return;
      }

      const html = this._engine.getResult();
      const patch = splitBlock(html, blockText, cursorPos, tagName);

      if (patch) {
        try {
          this._engine.addPatch(patch.original, patch.replacement);
          this.render();
          this._onEdit();
        } catch (err) {
          console.error('[Preview] Split failed:', err);
        }
      } else {
        console.warn('[Preview] splitBlock returned null for:', { blockText: blockText.substring(0, 80), cursorPos, tagName });
      }
    });

    // Handle cancel
    btnCancel.addEventListener('click', () => overlay.remove());

    // Escape key
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        overlay.remove();
      }
    });
  }

  /* ── Block helpers ──────────────────────────────────────── */

  /**
   * Find the previous or next sibling block element of the same tag.
   * @private
   * @param {HTMLElement} blockEl
   * @param {'prev'|'next'} direction
   * @returns {HTMLElement|null}
   */
  _findAdjacentBlock(blockEl, direction) {
    const tag = blockEl.tagName;
    let sibling = direction === 'prev'
      ? blockEl.previousElementSibling
      : blockEl.nextElementSibling;

    // Walk past non-matching siblings (e.g., <ul> between two <p> elements)
    while (sibling) {
      if (sibling.tagName === tag) return /** @type {HTMLElement} */ (sibling);
      sibling = direction === 'prev'
        ? sibling.previousElementSibling
        : sibling.nextElementSibling;
    }
    return null;
  }

  /** @private */
  _norm(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /* ═══════════════════════════════════════════════════════════
     Tab activation  (Bootstrap tabs + pills)
     ═══════════════════════════════════════════════════════════ */

  /**
   * Wire up Bootstrap-style tab navigation:
   * - `.nav-tabs` (horizontal)
   * - `.nav-pills` (vertical sidebar)
   *
   * @private
   * @param {HTMLElement} root
   */
  _activateTabs(root) {
    const allNavLinks = root.querySelectorAll(
      '[data-toggle="tab"], [data-toggle="pill"], [data-bs-toggle="tab"], [data-bs-toggle="pill"]'
    );

    if (allNavLinks.length === 0) return;

    /** @type {Map<Element, HTMLElement[]>} */
    const navGroups = new Map();

    allNavLinks.forEach((link) => {
      const nav = link.closest('.nav-tabs, .nav-pills, .nav');
      if (!nav) return;
      if (!navGroups.has(nav)) navGroups.set(nav, []);
      navGroups.get(nav).push(/** @type {HTMLElement} */ (link));
    });

    navGroups.forEach((links, _nav) => {
      /** @type {Map<string, HTMLElement>} */
      const paneMap = new Map();

      links.forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (href.startsWith('#') && href.length > 1) {
          const pane = root.querySelector(href);
          if (pane) paneMap.set(href, /** @type {HTMLElement} */ (pane));
        }
      });

      // Ensure active state
      const hasActive = links.some((l) => l.classList.contains('active'));
      if (!hasActive && links.length > 0) {
        links[0].classList.add('active');
        const h = links[0].getAttribute('href') || '';
        paneMap.get(h)?.classList.add('active', 'show');
      }

      links.forEach((link) => {
        if (link.classList.contains('active')) {
          const h = link.getAttribute('href') || '';
          paneMap.get(h)?.classList.add('active', 'show');
        }
      });

      links.forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          links.forEach((l) => l.classList.remove('active'));
          paneMap.forEach((p) => p.classList.remove('active', 'show'));

          link.classList.add('active');
          const href = link.getAttribute('href') || '';
          paneMap.get(href)?.classList.add('active', 'show');
        });
      });
    });
  }
}
