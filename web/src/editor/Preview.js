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
import { splitBlock, mergeBlocks, findBlock, splitAtBreaks, getBlockDisplay, addSpaceAfter, removeSpaceAfter, removeFollowerSpacer } from './BlockOps.js';

/** Tags whose text content must NOT be wrapped. */
const SKIP_TAGS = new Set([
  'STYLE', 'SCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'NOSCRIPT',
]);

/** Tags whose text children are structural — skip wrapping. */
const STRUCTURAL_TAGS = new Set(['TH']);

/** Tags that count as "blocks" for merge/split. */
const BLOCK_TAGS = ['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

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

    // Assign early to prevent synchronous hover/pointer events from crashing
    this._container = container;

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

    // ── Prevent content links from navigating ──
    container.addEventListener('click', (e) => {
      const link = /** @type {HTMLElement} */ (e.target).closest('a[href]');
      if (link && !link.closest('.nav, .nav-tabs, .nav-pills')) {
        e.preventDefault();
      }
    });

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

      // Mark text inside links so the editor can handle them specially
      const parentLink = node.parentElement?.closest('a[href]');
      if (parentLink && !parentLink.closest('.nav')) {
        span.setAttribute('data-geo-link', '');
      }

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
    const isLinkText = span.hasAttribute('data-geo-link');

    this._inlineEditor = new InlineEditor(
      this._container,
      (newText) => {
        if (newText !== currentText) {
          try {
            if (isLinkText) {
              this._patchLinkText(currentText, newText);
            } else {
              this._engine.addPatch(currentText, newText);
            }
            this.render();
            this._onEdit();
          } catch (err) { console.error('[Preview] Patch failed:', err); }
        }
      },
      () => { /* cancel */ },
    );

    this._inlineEditor.open(span, currentText);
  }

  /**
   * Patch text that lives inside an `<a>` tag.
   * If text was appended at the end → place it AFTER `</a>`.
   * If text was prepended at the start → place it BEFORE `<a>`.
   * Otherwise → normal in-place replacement.
   * @private
   */
  _patchLinkText(originalText, newText) {
    const html = this._engine.getResult();

    // Find common prefix and suffix between old and new text
    let prefixLen = 0;
    const minLen = Math.min(originalText.length, newText.length);
    while (prefixLen < minLen && originalText[prefixLen] === newText[prefixLen]) prefixLen++;

    let suffixLen = 0;
    while (
      suffixLen < minLen - prefixLen &&
      originalText[originalText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) suffixLen++;

    // Case 1: text appended at the end (original text unchanged, extra at end)
    if (prefixLen === originalText.length) {
      const appended = newText.substring(originalText.length);
      // Find the pattern: originalText</a>  →  originalText</a>appended
      const needle = originalText + '</a>';
      if (html.includes(needle)) {
        this._engine.addPatch(needle, originalText + '</a>' + appended);
        return;
      }
    }

    // Case 2: text prepended at the start (original text unchanged, extra at start)
    if (suffixLen === originalText.length) {
      const prepended = newText.substring(0, newText.length - originalText.length);
      // Find a link opening tag right before the original text
      // Pattern: <a ...>originalText  →  prepended<a ...>originalText
      const re = new RegExp(`(<a\\b[^>]*>)(${this._escRegex(originalText)})`);
      const match = html.match(re);
      if (match) {
        this._engine.addPatch(match[0], prepended + match[0]);
        return;
      }
    }

    // Default: normal replacement (text changed in the middle)
    this._engine.addPatch(originalText, newText);
  }

  /** Escape special regex characters in a string. @private */
  _escRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ═══════════════════════════════════════════════════════════
     Block menu  (grip handle + dropdown)
     ═══════════════════════════════════════════════════════════ */

  /** @private */
  _setupBlockToolbar(root) {
    // ── Grip handle (appears on hover) ──
    const grip = document.createElement('button');
    grip.className = 'block-grip';
    grip.setAttribute('aria-label', 'Opciones de bloque');
    grip.innerHTML = '⋮⋮';
    grip.style.display = 'none';
    root.appendChild(grip);

    // ── Dropdown menu (appears on grip click) ──
    const menu = document.createElement('div');
    menu.className = 'block-menu';
    menu.style.display = 'none';
    root.appendChild(menu);

    // ── Spacer Guide (appears on block hover to visualize margin-bottom) ──
    const spacerGuide = document.createElement('div');
    spacerGuide.className = 'geo-spacer-guide';
    spacerGuide.style.display = 'none';
    root.appendChild(spacerGuide);

    /** @type {HTMLElement|null} */
    let hoveredBlock = null;
    /** @type {HTMLElement|null} */
    let selectedBlock = null;
    let menuOpen = false;

    // ── Hover → show/hide grip and spacer guide ──
    root.addEventListener('mouseover', (e) => {
      if (menuOpen || this._inlineEditor?.isOpen) return;
      const target = /** @type {HTMLElement} */ (e.target);
      if (target === grip || menu.contains(target)) return;

      const block = target.closest('p, li, h1, h2, h3, h4, h5, h6');
      const isValidBlock = block && !block.closest('.nav, .nav-tabs, .nav-pills');

      if (isValidBlock) {
        if (block !== hoveredBlock) {
          hoveredBlock = /** @type {HTMLElement} */ (block);
          this._positionGrip(grip, /** @type {HTMLElement} */ (block));
          grip.style.display = '';

          // ── Spacer guide visualization ──
          const tagName = block.tagName.toUpperCase();
          const baseline = tagName === 'LI' ? 10 : (tagName.startsWith('H') ? 8 : 16);

          // Determine if a custom margin-bottom has been applied inline
          const styleAttr = block.getAttribute('style') || '';
          const inlineMarginMatch = styleAttr.match(/margin-bottom\s*:\s*(\d+)px/i);
          const hasInlineMargin = !!inlineMarginMatch;
          const inlineMarginVal = inlineMarginMatch ? parseInt(inlineMarginMatch[1], 10) : baseline;
          const isModified = hasInlineMargin && inlineMarginVal !== baseline;

          // ── Skip UI elements AND empty spacer elements to find real content ──
          let nextContentEl = this._getNextContentElement(block);
          while (
            nextContentEl &&
            (nextContentEl === grip ||
             nextContentEl === menu ||
             nextContentEl === spacerGuide ||
             getComputedStyle(nextContentEl).display === 'none' ||
             this._isEmptySpacerEl(nextContentEl))
          ) {
            nextContentEl = this._getNextContentElement(nextContentEl);
          }

          // Also scan to immediate next (may be an empty p/br) for intermediate detection
          let immediateNext = this._getNextContentElement(block);
          const hasEmptyIntermediates = !!(immediateNext && this._isEmptySpacerEl(immediateNext));

          const cr = root.getBoundingClientRect();
          const br = block.getBoundingClientRect();
          let realGapPx = 0;

          if (nextContentEl) {
            const nextBrTop = this._getVisualTop(nextContentEl);
            realGapPx = Math.round(nextBrTop - br.bottom);
          }

          const displayHeight = nextContentEl
            ? Math.max(realGapPx, 0)
            : inlineMarginVal;

          if (displayHeight > 0) {
            spacerGuide.style.top = `${br.bottom - cr.top + root.scrollTop}px`;
            spacerGuide.style.left = `${br.left - cr.left}px`;
            spacerGuide.style.width = `${br.width}px`;
            spacerGuide.style.height = `${displayHeight}px`;

            if (isModified || hasEmptyIntermediates) {
              spacerGuide.className = 'geo-spacer-guide';
              if (isModified) {
                const extra = inlineMarginVal - baseline;
                if (extra > 0) {
                  spacerGuide.textContent = `ESPACIO EXTRA: +${extra}px (Visual: ${displayHeight}px) ⤓`;
                } else {
                  spacerGuide.textContent = `ESPACIO PERSONALIZADO: ${inlineMarginVal}px (Visual: ${displayHeight}px) ⤓`;
                }
              } else {
                spacerGuide.textContent = `ESPACIO POR ELEMENTOS VACÍOS: ${displayHeight}px ⤓`;
              }
            } else {
              spacerGuide.className = 'geo-spacer-guide geo-spacer-guide--original';
              spacerGuide.textContent = `ESPACIO ORIGINAL: ${displayHeight}px ⤓`;
            }
            spacerGuide.style.display = 'flex';
          } else {
            spacerGuide.style.display = 'none';
          }

        }
      } else {
        if (!menuOpen) {
          grip.style.display = 'none';
          hoveredBlock = null;
          spacerGuide.style.display = 'none';
        }
      }
    });

    // ── Mouse leaves preview → hide grip and guide ──
    root.addEventListener('mouseleave', () => {
      if (!menuOpen) {
        grip.style.display = 'none';
        hoveredBlock = null;
        spacerGuide.style.display = 'none';
      }
    });

    // ── Click grip → open/close menu ──
    grip.addEventListener('click', (e) => {
      // If clicked on the invisible bridge (right side of the grip button)
      if (e.offsetX > 22) {
        // Find the editable element underneath
        grip.style.pointerEvents = 'none';
        const under = document.elementFromPoint(e.clientX, e.clientY);
        grip.style.pointerEvents = '';

        const editable = under?.closest('[data-geo-editable]');
        if (editable) {
          // Trigger click on the editable element to open the inline editor
          editable.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: e.clientX,
            clientY: e.clientY
          }));
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();

      if (menuOpen) {
        this._closeBlockMenu(menu, grip);
        menuOpen = false;
        selectedBlock = null;
        return;
      }

      if (!hoveredBlock) return;
      selectedBlock = hoveredBlock;
      selectedBlock.classList.add('block-selected');
      this._buildMenu(menu, selectedBlock);
      this._positionMenu(menu, grip);
      menu.style.display = '';
      menuOpen = true;
    });

    // ── Right-click → custom context menu ──
    root.addEventListener('contextmenu', (e) => {
      if (this._inlineEditor?.isOpen) return;

      const target = /** @type {HTMLElement} */ (e.target);
      const block = target.closest('p, li, h1, h2, h3, h4, h5, h6');
      if (!block || block.closest('.nav, .nav-tabs, .nav-pills')) return;

      e.preventDefault();
      e.stopPropagation();

      if (menuOpen) {
        this._closeBlockMenu(menu, grip);
      }

      selectedBlock = /** @type {HTMLElement} */ (block);
      selectedBlock.classList.add('block-selected');
      this._buildMenu(menu, selectedBlock);

      // Position menu at cursor coordinates
      const cr = this._container.getBoundingClientRect();
      menu.style.top = `${e.clientY - cr.top + this._container.scrollTop + 2}px`;
      menu.style.left = `${e.clientX - cr.left + 2}px`;
      menu.style.display = '';

      grip.style.display = 'none';
      menuOpen = true;
    });

    // ── Click menu item → action ──
    menu.addEventListener('click', (e) => {
      const item = /** @type {HTMLElement} */ (e.target).closest('[data-action]');
      if (!item || !selectedBlock) return;

      e.preventDefault();
      e.stopPropagation();

      const action = item.getAttribute('data-action');
      const blockEl = selectedBlock;

      this._closeBlockMenu(menu, grip);
      menuOpen = false;
      selectedBlock = null;
      hoveredBlock = null;

      if (action === 'merge-up')     this._doMerge(blockEl, 'up');
      else if (action === 'merge-down')  this._doMerge(blockEl, 'down');
      else if (action === 'split')       this._doSplit(blockEl);
      else if (action === 'clean-br')    this._doCleanBr(blockEl);
      else if (action === 'split-lines') this._doSplitLines(blockEl);
      else if (action === 'add-space')   this._showSpaceEditor(blockEl);
      else if (action === 'remove-space') this._doRemoveSpace(blockEl);
    });

    // ── Click outside → close menu ──
    document.addEventListener('click', (e) => {
      if (!menuOpen) return;
      if (grip.contains(/** @type {Node} */ (e.target))) return;
      if (menu.contains(/** @type {Node} */ (e.target))) return;

      this._closeBlockMenu(menu, grip);
      menuOpen = false;
      selectedBlock = null;
    });

    // ── Escape → close menu ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) {
        this._closeBlockMenu(menu, grip);
        menuOpen = false;
        selectedBlock = null;
      }
    });

    this._blockGrip = grip;
    this._blockMenu = menu;
  }

  /** Position the grip handle to the left of a block. @private */
  _positionGrip(grip, block) {
    const cr = this._container.getBoundingClientRect();
    const br = block.getBoundingClientRect();
    grip.style.top = `${br.top - cr.top + this._container.scrollTop + 4}px`;
    grip.style.left = `${br.left - cr.left - 28}px`;
  }

  /** Position the dropdown menu below the grip handle. @private */
  _positionMenu(menu, grip) {
    const cr = this._container.getBoundingClientRect();
    const gr = grip.getBoundingClientRect();
    menu.style.top = `${gr.bottom - cr.top + this._container.scrollTop + 4}px`;
    menu.style.left = `${gr.left - cr.left}px`;
  }

  /** Build menu items based on the selected block's context. @private */
  _buildMenu(menu, block) {
    const hasPrev = !!this._findAdjacentBlock(block, 'prev');
    const hasNext = !!this._findAdjacentBlock(block, 'next');
    const hasBr = !!block.querySelector('br');

    let html = '';

    // ── Merge group ──
    if (hasPrev || hasNext) {
      if (hasPrev) html += `<button class="block-menu__item" data-action="merge-up"><span class="block-menu__icon">⬆</span>Unir con anterior</button>`;
      if (hasNext) html += `<button class="block-menu__item" data-action="merge-down"><span class="block-menu__icon">⬇</span>Unir con siguiente</button>`;
      html += '<div class="block-menu__sep"></div>';
    }

    // ── Break operations ──
    if (hasBr) {
      html += `<button class="block-menu__item" data-action="split-lines"><span class="block-menu__icon">↕</span>Separar todas las líneas</button>`;
      html += `<button class="block-menu__item" data-action="clean-br"><span class="block-menu__icon">⊟</span>Quitar saltos de línea</button>`;
      html += '<div class="block-menu__sep"></div>';
    }

    // ── Split ──
    html += `<button class="block-menu__item" data-action="split"><span class="block-menu__icon">✂</span>Separar en un punto</button>`;
    html += '<div class="block-menu__sep"></div>';

    // ── Spacing ──
    html += `<button class="block-menu__item" data-action="add-space"><span class="block-menu__icon">➕</span>Añadir espacio después</button>`;

    // Show "remove space" when there is any visible space after the block.
    const blockTagName = block.tagName.toUpperCase();
    const blockBaseline = blockTagName === 'LI' ? 10 : (blockTagName.startsWith('H') ? 8 : 16);
    const styleAttr = block.getAttribute('style') || '';
    const inlineMarginMatch = styleAttr.match(/margin-bottom\s*:\s*(\d+)px/i);
    const inlineMarginVal = inlineMarginMatch ? parseInt(inlineMarginMatch[1], 10) : blockBaseline;

    let nextContentEl = this._getNextContentElement(block);
    while (
      nextContentEl &&
      (nextContentEl === this._blockGrip ||
       nextContentEl === this._blockMenu ||
       nextContentEl.classList?.contains('geo-spacer-guide') ||
       getComputedStyle(nextContentEl).display === 'none' ||
       this._isEmptySpacerEl(nextContentEl))
    ) {
      nextContentEl = this._getNextContentElement(nextContentEl);
    }

    const br = block.getBoundingClientRect();
    let realGapPx = 0;
    if (nextContentEl) {
      const nextBrTop = this._getVisualTop(nextContentEl);
      realGapPx = Math.round(nextBrTop - br.bottom);
    }

    const displayHeight = nextContentEl ? Math.max(realGapPx, 0) : inlineMarginVal;
    if (displayHeight > 0) {
      html += `<button class="block-menu__item" data-action="remove-space"><span class="block-menu__icon">➖</span>Quitar espacio después</button>`;
    }

    menu.innerHTML = html;
  }

  /** Close the dropdown and clean up selection. @private */
  _closeBlockMenu(menu, grip) {
    menu.style.display = 'none';
    const selected = this._container?.querySelector('.block-selected');
    if (selected) selected.classList.remove('block-selected');
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

    const prevIndex = this._getBlockIndex(prevEl);
    const currIndex = this._getBlockIndex(currEl);

    const html = this._engine.getResult();
    const patch = mergeBlocks(html, currText, prevText, tagName, currIndex, prevIndex);

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
    const blockIndex = this._getBlockIndex(blockEl);
    const block = findBlock(html, blockText, tagName, blockIndex);
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

  /* ── Split Lines implementation ────────────────────────── */

  /** Convert each `<br>` inside a block into a separate paragraph. @private */
  _doSplitLines(blockEl) {
    const tagName = blockEl.tagName.toLowerCase();
    const blockText = this._norm(blockEl.textContent);

    const html = this._engine.getResult();
    const blockIndex = this._getBlockIndex(blockEl);
    const patch = splitAtBreaks(html, blockText, tagName, blockIndex);

    if (patch) {
      try {
        this._engine.addPatch(patch.original, patch.replacement);
        this.render();
        this._onEdit();
      } catch (err) {
        console.error('[Preview] Split lines failed:', err);
      }
    } else {
      console.warn('[Preview] splitAtBreaks returned null.');
    }
  }

  /* ── Split implementation ──────────────────────────────── */

  /** @private */
  _doSplit(blockEl) {
    const tagName = blockEl.tagName.toLowerCase();
    const blockText = this._norm(blockEl.textContent);

    // Close any existing editor
    if (this._inlineEditor?.isOpen) this._inlineEditor.close();

    // Get display text (with <br> shown as \n)
    const html = this._engine.getResult();
    const blockIndex = this._getBlockIndex(blockEl);
    const block = findBlock(html, blockText, tagName, blockIndex);
    if (!block) {
      console.warn('[Preview] _doSplit: could not find block.');
      return;
    }
    const display = getBlockDisplay(block.innerHTML);

    this._showSplitEditor(blockEl, blockText, display.text, tagName);
  }

  /**
   * Opens a textarea over the paragraph with the display text for splitting.
   * The display text shows `<br>` as visible newlines.
   * @private
   */
  _showSplitEditor(blockEl, blockText, displayText, tagName) {
    // Create the split overlay
    const overlay = document.createElement('div');
    overlay.className = 'split-editor';

    const hint = document.createElement('div');
    hint.className = 'split-editor__hint';
    hint.textContent = 'Coloca el cursor donde quieras separar y presiona el botón:';

    const textarea = document.createElement('textarea');
    textarea.className = 'split-editor__textarea';
    textarea.value = displayText;
    textarea.rows = Math.min(displayText.split('\n').length + 1, 10);

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

      if (cursorPos <= 0 || cursorPos >= displayText.length) {
        console.warn('[Preview] Split position at boundary, ignoring.');
        return;
      }

      const html = this._engine.getResult();
      const blockIndex = this._getBlockIndex(blockEl);
      const patch = splitBlock(html, blockText, cursorPos, tagName, blockIndex);

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

  /* ── Add Space implementation ──────────────────────────── */

  /** Show an interactive popup to set custom margin-bottom on the block. @private */
  _showSpaceEditor(blockEl) {
    const tagName = blockEl.tagName.toLowerCase();
    const blockText = this._norm(blockEl.textContent);
    const blockIndex = this._getBlockIndex(blockEl);

    // Get current margin size
    const styleAttr = blockEl.getAttribute('style') || '';
    const match = styleAttr.match(/margin-bottom\s*:\s*(\d+)px/i);
    const baseline = tagName === 'li' ? 10 : (tagName.startsWith('h') ? 8 : 16);
    const currentMargin = match ? parseInt(match[1], 10) : baseline;

    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'space-editor';

    const title = document.createElement('div');
    title.className = 'space-editor__title';
    title.textContent = 'Ajustar espacio inferior';

    // Preset buttons
    const presetsDiv = document.createElement('div');
    presetsDiv.className = 'space-editor__presets';

    const presets = [
      { label: '+10px', val: baseline + 10 },
      { label: '+20px', val: baseline + 20 },
      { label: '+30px', val: baseline + 30 },
      { label: 'Original', val: baseline },
    ];

    presets.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'space-editor__preset-btn';
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        inputField.value = String(p.val);
      });
      presetsDiv.appendChild(btn);
    });

    // Custom input area
    const customDiv = document.createElement('div');
    customDiv.className = 'space-editor__custom';

    const label = document.createElement('label');
    label.className = 'space-editor__label';
    label.textContent = 'Tamaño:';

    const inputField = document.createElement('input');
    inputField.type = 'number';
    inputField.className = 'space-editor__input';
    inputField.min = '0';
    inputField.max = '200';
    inputField.value = String(currentMargin);

    const unit = document.createElement('span');
    unit.className = 'space-editor__unit';
    unit.textContent = 'px';

    customDiv.append(label, inputField, unit);

    // Actions area
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'space-editor__actions';

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'space-editor__btn space-editor__btn--confirm';
    btnSave.textContent = 'Guardar';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'space-editor__btn space-editor__btn--cancel';
    btnCancel.textContent = 'Cancelar';

    actionsDiv.append(btnSave, btnCancel);
    overlay.append(title, presetsDiv, customDiv, actionsDiv);

    // Position overlay over the block element
    const containerRect = this._container.getBoundingClientRect();
    const blockRect = blockEl.getBoundingClientRect();

    // Position slightly below the element, aligned to its left
    overlay.style.top = `${blockRect.bottom - containerRect.top + this._container.scrollTop + 4}px`;
    overlay.style.left = `${blockRect.left - containerRect.left}px`;

    this._container.appendChild(overlay);
    inputField.focus();
    inputField.select();

    // Confirm handler
    btnSave.addEventListener('click', () => {
      const val = parseInt(inputField.value, 10);
      overlay.remove();
      if (isNaN(val) || val < 0) return;

      const html = this._engine.getResult();
      const patch = addSpaceAfter(html, blockText, tagName, blockIndex, val);

      if (patch) {
        try {
          this._engine.addPatch(patch.original, patch.replacement);
          this.render();
          this._onEdit();
        } catch (err) {
          console.error('[Preview] Set space size failed:', err);
        }
      }
    });

    // Cancel handler
    btnCancel.addEventListener('click', () => overlay.remove());

    // Close on Escape key or submit on Enter
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        overlay.remove();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        btnSave.click();
      }
    });
  }

  /** Decrease margin-bottom or remove empty spacer elements after a block. @private */
  _doRemoveSpace(blockEl) {
    const tagName = blockEl.tagName.toLowerCase();
    const blockText = this._norm(blockEl.textContent);
    const blockIndex = this._getBlockIndex(blockEl);

    // ── Try reducing inline margin-bottom first ──────────────
    const html = this._engine.getResult();
    const patch = removeSpaceAfter(html, blockText, tagName, blockIndex);

    if (patch) {
      try {
        this._engine.addPatch(patch.original, patch.replacement);
        this.render();
        this._onEdit();
        return;
      } catch (err) {
        console.error('[Preview] Remove space (margin) failed:', err);
      }
    }

    // ── Fallback 2: remove the first empty spacer element after this block ──
    let nextEl = this._getNextContentElement(blockEl);

    if (nextEl && this._isEmptySpacerEl(nextEl)) {
      const spacerPatch = removeFollowerSpacer(html, blockText, tagName, blockIndex);
      if (spacerPatch) {
        try {
          this._engine.addPatch(spacerPatch.original, spacerPatch.replacement);
          this.render();
          this._onEdit();
          return;
        } catch (err) {
          console.error('[Preview] Remove follower spacer failed:', err);
        }
      }
    }

    // ── Fallback 3: Reduce below baseline ──────────────────────
    // If we are at the baseline (no custom inline margin is set) and there are no empty spacer elements,
    // explicitly set it below baseline (baseline - 10, clamped to 0) to override browser/Moodle CSS defaults.
    const baseline = tagName === 'li' ? 10 : (tagName.startsWith('h') ? 8 : 16);
    const styleAttr = blockEl.getAttribute('style') || '';
    const inlineMarginMatch = styleAttr.match(/margin-bottom\s*:\s*(\d+)px/i);
    if (!inlineMarginMatch) {
      const newVal = Math.max(0, baseline - 10);
      const patchBelow = addSpaceAfter(html, blockText, tagName, blockIndex, newVal);
      if (patchBelow) {
        try {
          this._engine.addPatch(patchBelow.original, patchBelow.replacement);
          this.render();
          this._onEdit();
        } catch (err) {
          console.error('[Preview] Reduce below baseline failed:', err);
        }
      }
    }
  }

  /**
   * Returns true if an element is an "empty spacer" — a block element containing
   * only whitespace, `<br>`, or `&nbsp;` with no meaningful content.
   * @private
   * @param {Element} el
   * @returns {boolean}
   */
  _isEmptySpacerEl(el) {
    const tag = el.tagName.toUpperCase();
    if (tag === 'BR') return true;
    // Only consider block elements that Moodle uses as spacers
    if (!['P', 'DIV', 'SPAN'].includes(tag)) return false;
    const text = (el.textContent || '').replace(/\u00a0/g, '').trim(); // strip &nbsp;
    if (text.length > 0) return false;
    // Allow only <br> children (or no children)
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent && child.textContent.replace(/\u00a0/g, '').trim()) return false;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (/** @type {Element} */ (child).tagName.toUpperCase() !== 'BR') return false;
      }
    }
    return true;
  }

  /**
   * Returns true if there is at least one empty spacer element immediately
   * after the given block (before the next element with real content).
   * @private
   * @param {HTMLElement} blockEl
   * @returns {boolean}
   */
  _hasEmptyFollowers(blockEl) {
    let el = blockEl.nextElementSibling;
    while (
      el &&
      (el.classList?.contains('block-grip') ||
       el.classList?.contains('block-menu') ||
       el.classList?.contains('geo-spacer-guide'))
    ) {
      el = el.nextElementSibling;
    }
    return !!(el && this._isEmptySpacerEl(el));
  }

  /**
   * Find the next logical content element in the DOM, traversing up and down if needed
   * (e.g. to cross list boundaries and skip UI elements).
   * @private
   * @param {Element} el
   * @returns {Element|null}
   */
  _getNextContentElement(el) {
    let curr = el;
    while (curr && curr !== this._container) {
      let sibling = curr.nextElementSibling;
      while (sibling) {
        if (
          sibling === this._blockGrip ||
          sibling === this._blockMenu ||
          sibling.classList?.contains('geo-spacer-guide')
        ) {
          sibling = sibling.nextElementSibling;
          continue;
        }

        const firstContent = this._findFirstContentInside(sibling);
        if (firstContent) return firstContent;

        sibling = sibling.nextElementSibling;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  /**
   * Find the first leaf content element inside a node.
   * @private
   * @param {Element} node
   * @returns {Element|null}
   */
  _findFirstContentInside(node) {
    if (!node) return null;
    const tag = node.tagName?.toUpperCase();
    if (!tag) return null;

    if (
      node === this._blockGrip ||
      node === this._blockMenu ||
      node.classList?.contains('geo-spacer-guide') ||
      getComputedStyle(node).display === 'none'
    ) {
      return null;
    }

    if (['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR'].includes(tag)) {
      return node;
    }

    for (const child of node.children) {
      const found = this._findFirstContentInside(child);
      if (found) return found;
    }

    return null;
  }

  /**
   * Get the actual visual top client coordinate of an element's first real content
   * (skipping leading <br> tags by measuring the first text node or non-br child).
   * @private
   * @param {Element} el
   * @returns {number}
   */
  _getVisualTop(el) {
    if (el.tagName === 'BR') {
      return el.getBoundingClientRect().top;
    }

    for (const child of el.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = /** @type {Element} */ (child);
        if (childEl.tagName === 'BR') {
          continue; // skip leading BR
        }
        return this._getVisualTop(childEl);
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').trim();
        if (text.length > 0) {
          const range = document.createRange();
          range.selectNode(child);
          const rects = range.getClientRects();
          if (rects.length > 0) {
            return rects[0].top;
          }
        }
      }
    }

    return el.getBoundingClientRect().top;
  }

  /* ── Block helpers ──────────────────────────────────────── */

  /**
   * Get the absolute index of a block element relative to all blocks of the same tag.
   * @private
   * @param {HTMLElement} blockEl
   * @returns {number}
   */
  _getBlockIndex(blockEl) {
    const tagName = blockEl.tagName.toUpperCase();
    const allOfSameTag = Array.from(this._container.querySelectorAll(tagName));
    return allOfSameTag.indexOf(blockEl);
  }

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

    navGroups.forEach((links, nav) => {
      // ── Find the sibling .tab-content for this nav ──────────
      // Prefer a sibling or parent-sibling tab-content for scoped lookups
      const tabContentScope =
        nav.nextElementSibling?.classList.contains('tab-content')
          ? nav.nextElementSibling
          : nav.closest('div, section')?.querySelector('.tab-content') || root;

      /** @type {Map<string, HTMLElement>} */
      const paneMap = new Map();

      links.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const id = href.startsWith('#') ? href.slice(1) : '';
        if (!id) return;

        // First try scoped search within tab-content, then fall back to root
        let pane = /** @type {HTMLElement|null} */ (
          tabContentScope.querySelector(`#${CSS.escape(id)}`)
          ?? root.querySelector(`#${CSS.escape(id)}`)
        );

        if (pane) paneMap.set(href, pane);
      });

      // ── Strip all active/show from all panes first ───────────
      paneMap.forEach((pane) => {
        pane.classList.remove('active', 'show');
      });

      // ── Determine which link should be active ────────────────
      const activeLink = links.find((l) => l.classList.contains('active')) ?? links[0];
      if (!activeLink) return;

      // Ensure only this link is marked active
      links.forEach((l) => l.classList.remove('active'));
      activeLink.classList.add('active');

      // Activate the corresponding pane
      const activeHref = activeLink.getAttribute('href') || '';
      const activePane = paneMap.get(activeHref);
      if (activePane) activePane.classList.add('active', 'show');

      // ── Wire click events ─────────────────────────────────────
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
