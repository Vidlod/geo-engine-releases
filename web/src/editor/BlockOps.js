/**
 * @fileoverview GEO Engine — Block-level operations (merge / split).
 *
 * Operates directly on the HTML **string** to merge or split block elements
 * (`<p>`, `<li>`) without DOM serialisation, preserving formatting.
 *
 * @module editor/BlockOps
 */

/* ── Helpers ──────────────────────────────────────────────── */

/** Collapse whitespace and trim for comparison. */
function norm(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(html) {
  if (typeof document !== 'undefined') {
    const temp = document.createElement('textarea');
    temp.innerHTML = html;
    return temp.value;
  }
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#160;/g, ' ');
}

/** Strip HTML tags and decode common entities to get plain text. */
function htmlToText(html) {
  const stripped = html.replace(/<[^>]+>/g, '');
  return decodeEntities(stripped);
}

/**
 * Parse ALL `<tag>…</tag>` blocks out of an HTML string.
 * Returns them in order of appearance.
 * @param {string} html
 * @param {string} tagName  e.g. 'p'
 * @returns {Array<{tag: string, attrs: string, innerHTML: string, start: number, end: number, fullMatch: string, text: string}>}
 */
function parseAllBlocks(html, tagName) {
  const blocks = [];
  const re = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)</${tagName}>`, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) {
    blocks.push({
      tag: tagName,
      attrs: m[1],
      innerHTML: m[2],
      start: m.index,
      end: m.index + m[0].length,
      fullMatch: m[0],
      text: norm(htmlToText(m[2])),
    });
  }
  return blocks;
}

/**
 * Find a block in the HTML by normalised text content.
 * Falls back to prefix matching if exact match fails.
 */
export function findBlock(html, textContent, tagName = 'p', blockIndex = null) {
  const blocks = parseAllBlocks(html, tagName);

  if (blockIndex !== null && blockIndex >= 0 && blockIndex < blocks.length) {
    const candidate = blocks[blockIndex];
    const target = norm(textContent);
    // Safety check: verify that the content is reasonably matching (first 30 chars)
    if (!target || candidate.text.startsWith(target.substring(0, 30)) || target.startsWith(candidate.text.substring(0, 30))) {
      return candidate;
    }
  }

  const target = norm(textContent);
  if (!target) return null;

  // 1. Exact match
  for (const b of blocks) {
    if (b.text === target) return b;
  }

  // 2. Prefix match (first 80 chars) as fallback
  const prefix = target.substring(0, 80);
  for (const b of blocks) {
    if (b.text.startsWith(prefix)) return b;
  }

  return null;
}

/* ── Merge ────────────────────────────────────────────────── */

/**
 * Merge two adjacent paragraphs into one.
 *
 * Replaces: `<p A>contentA</p>…whitespace…<p B>contentB</p>`
 * With:     `<p A>contentA contentB</p>`
 *
 * @param {string} html              Full HTML string
 * @param {string} currTextContent   Text of the paragraph to absorb
 * @param {string} prevTextContent   Text of the paragraph that stays
 * @param {string} [tagName='p']
 * @returns {{ original: string, replacement: string } | null}
 */
export function mergeBlocks(html, currTextContent, prevTextContent, tagName = 'p', currBlockIndex = null, prevBlockIndex = null) {
  const prevBlock = findBlock(html, prevTextContent, tagName, prevBlockIndex);
  const currBlock = findBlock(html, currTextContent, tagName, currBlockIndex);

  if (!prevBlock || !currBlock) {
    console.warn('[BlockOps] mergeBlocks: could not find one or both blocks.',
      { prevFound: !!prevBlock, currFound: !!currBlock });
    return null;
  }

  if (prevBlock.start >= currBlock.start) {
    console.warn('[BlockOps] mergeBlocks: prev is not before curr.');
    return null;
  }

  // Safety: only merge if the content between them is safely deletable
  const between = html.substring(prevBlock.end, currBlock.start);
  
  let s = between;
  s = s.replace(/<!--[\s\S]*?-->/g, ''); // comments
  s = s.replace(/(&nbsp;|&#160;|<br\s*\/?>|\s)+/gi, ''); // whitespace/breaks
  let prevStr;
  do {
    prevStr = s;
    s = s.replace(/<([a-z0-9]+)[^>]*><\/\1>/gi, ''); // empty tags
  } while (s !== prevStr);

  if (s.length > 0) {
    console.warn('[BlockOps] mergeBlocks: non-empty content between blocks:', between.substring(0, 100));
    return null;
  }

  // Replace both blocks + whitespace with one merged block
  const original = html.substring(prevBlock.start, currBlock.end);
  const merged = `<${tagName}${prevBlock.attrs}>${prevBlock.innerHTML} ${currBlock.innerHTML}</${tagName}>`;

  return { original, replacement: merged };
}

/* ── Display-text mapping ─────────────────────────────────── */

/**
 * Build a "display text" from innerHTML:
 *  • `<br>` → `\n`
 *  • other tags stripped
 *  • runs of whitespace collapsed (newlines preserved)
 *  • HTML entities decoded
 *
 * Also returns `toHtml(displayOffset)` to map a cursor position
 * in the display text back to the corresponding byte-offset in
 * the innerHTML string.
 *
 * @param {string} innerHTML
 * @returns {{ text: string, toHtml: (offset: number) => number }}
 */
export function getBlockDisplay(innerHTML) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} — chars[i] came from innerHTML[offsets[i]] */
  const offsets = [];
  let i = 0;
  let lastWasSpace = false;
  let lineStart = true;
  const len = innerHTML.length;

  while (i < len) {
    // ── HTML tags ──
    if (innerHTML[i] === '<') {
      const rest = innerHTML.substring(i);
      const brMatch = rest.match(/^<br\s*\/?>/i);
      if (brMatch) {
        offsets.push(i);
        chars.push('\n');
        lastWasSpace = false;
        lineStart = true;
        i += brMatch[0].length;
        continue;
      }
      // Skip other tags
      while (i < len && innerHTML[i] !== '>') i++;
      i++;
      continue;
    }

    // ── HTML entities ──
    if (innerHTML[i] === '&') {
      const semi = innerHTML.indexOf(';', i);
      if (semi !== -1 && semi - i < 10) {
        const ent = innerHTML.substring(i, semi + 1);
        const isSpace = ent === '&nbsp;';
        if (isSpace) {
          if (!lastWasSpace && !lineStart) {
            offsets.push(i); chars.push(' '); lastWasSpace = true;
          }
        } else {
          const ch = ent === '&amp;' ? '&' :
                     ent === '&lt;'  ? '<' :
                     ent === '&gt;'  ? '>' :
                     ent === '&quot;' ? '"' :
                     ent === '&#39;' || ent === '&#039;' ? "'" : '?';
          offsets.push(i); chars.push(ch);
          lastWasSpace = false; lineStart = false;
        }
        i = semi + 1;
        continue;
      }
    }

    // ── Whitespace ──
    if (/\s/.test(innerHTML[i])) {
      if (!lastWasSpace && !lineStart) {
        offsets.push(i); chars.push(' '); lastWasSpace = true;
      }
      i++;
      continue;
    }

    // ── Regular character ──
    offsets.push(i); chars.push(innerHTML[i]);
    lastWasSpace = false; lineStart = false;
    i++;
  }

  // Trim trailing spaces (but keep trailing \n)
  while (chars.length && chars[chars.length - 1] === ' ') {
    chars.pop(); offsets.pop();
  }

  return {
    text: chars.join(''),
    toHtml(displayOffset) {
      if (displayOffset <= 0) return 0;
      if (displayOffset >= offsets.length) return len;
      return offsets[displayOffset];
    },
  };
}

/* ── Split ────────────────────────────────────────────────── */

/**
 * Split a block element into two at the given *display-text* offset.
 *
 * The offset comes from a textarea showing `getBlockDisplay(innerHTML).text`,
 * so it accounts for collapsed whitespace and `<br>` → `\n`.
 *
 * @param {string} html            Full HTML string
 * @param {string} textContent     Normalised text (for findBlock)
 * @param {number} displayOffset   Cursor position in display text
 * @param {string} [tagName='p']
 * @returns {{ original: string, replacement: string } | null}
 */
export function splitBlock(html, textContent, displayOffset, tagName = 'p', blockIndex = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] splitBlock: could not find block.');
    return null;
  }

  const display = getBlockDisplay(block.innerHTML);
  const htmlOffset = display.toHtml(displayOffset);

  let before = block.innerHTML.substring(0, htmlOffset);
  let after = block.innerHTML.substring(htmlOffset);

  // Trim trailing/leading whitespace and <br> at the split point
  before = before.replace(/(\s|<br\s*\/?>)+$/gi, '');
  after = after.replace(/^(\s|<br\s*\/?>)+/gi, '');

  if (!before.trim() || !after.trim()) return null; // nothing useful on one side

  // Detect indentation
  const lineStart = html.lastIndexOf('\n', block.start);
  const indent = lineStart >= 0
    ? (html.substring(lineStart + 1, block.start).match(/^(\s*)/)?.[1] ?? '')
    : '';

  return {
    original: block.fullMatch,
    replacement:
      `<${tagName}${block.attrs}>${before}</${tagName}>\n` +
      `${indent}<${tagName}${block.attrs}>${after}</${tagName}>`,
  };
}

/* ── Add space ────────────────────────────────────────────── */

/**
 * Add or adjust spacing after a block element by updating its `margin-bottom` inline style.
 *
 * Strategy: modify the element's own style. If a custom `marginValue` is specified,
 * set it directly. If the value drops to baseline (10px for li, 16px for p), the inline
 * property is cleaned up and removed entirely.
 *
 * @param {string} html          Full HTML string
 * @param {string} textContent   Normalised text (for findBlock)
 * @param {string} [tagName='p']
 * @param {number|null} [blockIndex=null]
 * @param {number|null} [marginValue=null]
 * @returns {{ original: string, replacement: string } | null}
 */
export function addSpaceAfter(html, textContent, tagName = 'p', blockIndex = null, marginValue = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] addSpaceAfter: could not find block.');
    return null;
  }

  let newAttrs = block.attrs;
  const marginRegex = /margin-bottom\s*:\s*(\d+)px/i;
  const existingMatch = newAttrs.match(marginRegex);

  if (marginValue !== null) {
    const newVal = parseInt(marginValue, 10);
    const tagLower = tagName.toLowerCase();
    const baseline = tagLower === 'li' ? 10 : (tagLower.startsWith('h') ? 8 : 16);

    if (newVal === baseline) {
      // Revert to baseline: remove margin-bottom entirely to keep HTML clean
      if (existingMatch) {
        newAttrs = newAttrs.replace(/style="([^"]*)"/i, (_m, styleVal) => {
          let cleaned = styleVal.replace(/\s*margin-bottom\s*:\s*[^;]+;?\s*/i, '');
          cleaned = cleaned.replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').replace(/;\s*;/g, ';').trim();
          if (!cleaned) return '';
          return `style="${cleaned}"`;
        });
        newAttrs = newAttrs.replace(/style='([^']*)'/i, (_m, styleVal) => {
          let cleaned = styleVal.replace(/\s*margin-bottom\s*:\s*[^;]+;?\s*/i, '');
          cleaned = cleaned.replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').replace(/;\s*;/g, ';').trim();
          if (!cleaned) return '';
          return `style='${cleaned}'`;
        });
      }
    } else {
      // Set specified custom value (could be larger or smaller than baseline)
      if (existingMatch) {
        newAttrs = newAttrs.replace(marginRegex, `margin-bottom: ${newVal}px`);
      } else if (newAttrs.includes('style=')) {
        newAttrs = newAttrs.replace(/style="([^"]*)"/i, (_m, p1) => {
          const trimmed = p1.trim();
          const sep = (trimmed && !trimmed.endsWith(';')) ? ';' : '';
          return `style="${trimmed}${sep} margin-bottom: ${newVal}px;"`;
        });
        newAttrs = newAttrs.replace(/style='([^']*)'/i, (_m, p1) => {
          const trimmed = p1.trim();
          const sep = (trimmed && !trimmed.endsWith(';')) ? ';' : '';
          return `style='${trimmed}${sep} margin-bottom: ${newVal}px;'`;
        });
      } else {
        newAttrs = ` style="margin-bottom: ${newVal}px;"` + newAttrs;
      }
    }
  } else {
    // Default incremental logic (+10px) if no custom value is specified
    if (existingMatch) {
      const currentVal = parseInt(existingMatch[1], 10);
      const newVal = currentVal + 10;
      newAttrs = newAttrs.replace(marginRegex, `margin-bottom: ${newVal}px`);
    } else if (newAttrs.includes('style=')) {
      const initialMargin = tagName === 'li' ? 20 : 26;
      newAttrs = newAttrs.replace(/style="([^"]*)"/i, (_m, p1) => {
        const trimmed = p1.trim();
        const sep = (trimmed && !trimmed.endsWith(';')) ? ';' : '';
        return `style="${trimmed}${sep} margin-bottom: ${initialMargin}px;"`;
      });
      newAttrs = newAttrs.replace(/style='([^']*)'/i, (_m, p1) => {
        const trimmed = p1.trim();
        const sep = (trimmed && !trimmed.endsWith(';')) ? ';' : '';
        return `style='${trimmed}${sep} margin-bottom: ${initialMargin}px;'`;
      });
    } else {
      const initialMargin = tagName === 'li' ? 20 : 26;
      newAttrs = ` style="margin-bottom: ${initialMargin}px;"` + newAttrs;
    }
  }

  return {
    original: block.fullMatch,
    replacement: `<${tagName}${newAttrs}>${block.innerHTML}</${tagName}>`,
  };
}

/* ── Remove space ─────────────────────────────────────────── */

/**
 * Remove spacing added by `addSpaceAfter` by decreasing `margin-bottom`.
 *
 * - `<li>` with `margin-bottom: 20px` → 10px (template default). At 10px → null (nothing to remove).
 * - `<p>` with inline `margin-bottom` → decreases by 10px. At ≤ 16px → removes the property
 *   entirely (letting Moodle CSS default take over).
 *
 * @param {string} html          Full HTML string
 * @param {string} textContent   Normalised text (for findBlock)
 * @param {string} [tagName='p']
 * @returns {{ original: string, replacement: string } | null}
 */
export function removeSpaceAfter(html, textContent, tagName = 'p', blockIndex = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] removeSpaceAfter: could not find block.');
    return null;
  }

  let newAttrs = block.attrs;
  const marginRegex = /margin-bottom\s*:\s*(\d+)px/i;
  const existingMatch = newAttrs.match(marginRegex);

  if (!existingMatch) {
    // No inline margin-bottom → nothing to remove
    return null;
  }

  const currentVal = parseInt(existingMatch[1], 10);
  const tagLower = tagName.toLowerCase();
  const baseline = tagLower === 'li' ? 10 : (tagLower.startsWith('h') ? 8 : 16);

  if (currentVal === 0) {
    return null; // already at minimum
  }

  // Calculate new value (decrease by 10px, clamped to 0)
  const newVal = Math.max(0, currentVal - 10);

  if (newVal === baseline) {
    // Revert to baseline: remove margin-bottom entirely to keep HTML clean
    newAttrs = newAttrs.replace(/style="([^"]*)"/i, (_m, styleVal) => {
      let cleaned = styleVal.replace(/\s*margin-bottom\s*:\s*[^;]+;?\s*/i, '');
      cleaned = cleaned.replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').replace(/;\s*;/g, ';').trim();
      if (!cleaned) return '';
      return `style="${cleaned}"`;
    });
    newAttrs = newAttrs.replace(/style='([^']*)'/i, (_m, styleVal) => {
      let cleaned = styleVal.replace(/\s*margin-bottom\s*:\s*[^;]+;?\s*/i, '');
      cleaned = cleaned.replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').replace(/;\s*;/g, ';').trim();
      if (!cleaned) return '';
      return `style='${cleaned}'`;
    });
  } else {
    newAttrs = newAttrs.replace(marginRegex, `margin-bottom: ${newVal}px`);
  }

  return {
    original: block.fullMatch,
    replacement: `<${tagName}${newAttrs}>${block.innerHTML}</${tagName}>`,
  };
}

/* ── Split at BR ──────────────────────────────────────────── */

/**
 * Split a block element into multiple blocks at every `<br>` boundary.
 *
 * Converts:  `<p A>line1<br>line2<br><br>line3</p>`
 * Into:      `<p A>line1</p>\n<p A>line2</p>\n<p A>line3</p>`
 *
 * Consecutive `<br>` tags are treated as a single boundary.
 *
 * @param {string} html          Full HTML string
 * @param {string} textContent   Text content of the block
 * @param {string} [tagName='p']
 * @returns {{ original: string, replacement: string } | null}
 */
export function splitAtBreaks(html, textContent, tagName = 'p', blockIndex = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] splitAtBreaks: could not find block.');
    return null;
  }

  // Check there are actually <br> tags to split on
  if (!/<br\s*\/?>/i.test(block.innerHTML)) return null;

  // Detect indentation
  const lineStart = html.lastIndexOf('\n', block.start);
  const indent = lineStart >= 0
    ? (html.substring(lineStart + 1, block.start).match(/^(\s*)/)?.[1] ?? '')
    : '';

  // Replace consecutive <br> (+ surrounding whitespace) with a paragraph boundary
  const boundary = `</${tagName}>\n${indent}<${tagName}${block.attrs}>`;
  const newInner = block.innerHTML.replace(/(\s*<br\s*\/?>\s*)+/gi, boundary);

  return {
    original: block.fullMatch,
    replacement: `<${tagName}${block.attrs}>${newInner}</${tagName}>`,
  };
}

/**
 * Locate the block in the HTML, find the first empty spacer element (<br>, <p><br></p>, etc.)
 * that immediately follows it in the HTML string, and remove it.
 *
 * @param {string} html          Full HTML string
 * @param {string} textContent   Text content of the block
 * @param {string} tagName       Tag name of the block
 * @param {number|null} blockIndex Absolute index of the block
 * @returns {{ original: string, replacement: string } | null}
 */
export function removeFollowerSpacer(html, textContent, tagName = 'p', blockIndex = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] removeFollowerSpacer: could not find block.');
    return null;
  }

  // Look at what follows the block in the HTML string.
  const afterBlock = html.substring(block.end);

  // Match a leading empty spacer element (<br>, <p><br></p>, etc.)
  // We allow optional closing list/item tags and whitespace before the spacer.
  // Group 1: captures any leading closing tags and whitespace.
  // Group 2: matches <br>.
  // Group 3: matches the tag name of other empty elements (like p, div, span).
  // Group 4: matches the attributes of the empty element.
  const spacerRegex = /^(\s*(?:<\/(?:ul|ol|li)>\s*)*)(?:(<br\s*\/?>)|<([a-z1-6]+)\b([^>]*)>\s*(?:<br\s*\/?>|&nbsp;|\s*)*<\/\3>)/i;
  const match = afterBlock.match(spacerRegex);
  if (!match) {
    return null;
  }

  const fullMatch = match[0];
  const capturedClosingTags = match[1];

  return {
    original: block.fullMatch + fullMatch,
    replacement: block.fullMatch + capturedClosingTags,
  };
}
