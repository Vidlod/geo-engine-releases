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
export function parseAllBlocks(html, tagName) {
  const blocks = [];
  const tagLower = tagName.toLowerCase();

  // If the tag name is not 'li', we can use the simple regex because nesting is impossible
  if (tagLower !== 'li') {
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

  // For 'li', we use a stack-based parser to correctly resolve nested tags
  const tokenRegex = /(<li\b[^>]*>)|(<\/li>)/gi;
  let m;
  const stack = [];

  while ((m = tokenRegex.exec(html)) !== null) {
    if (m[1]) {
      // Opening tag: push to stack
      stack.push({
        start: m.index,
        attrs: m[1].substring(3, m[1].length - 1), // extract attributes after "<li"
        tagHeadLength: m[1].length,
      });
    } else if (m[2] && stack.length > 0) {
      // Closing tag: pop matching opening tag from stack
      const openToken = stack.pop();
      const end = m.index + m[2].length;
      const fullMatch = html.substring(openToken.start, end);
      const innerHTML = html.substring(openToken.start + openToken.tagHeadLength, m.index);

      blocks.push({
        tag: 'li',
        attrs: openToken.attrs,
        innerHTML: innerHTML,
        start: openToken.start,
        end: end,
        fullMatch: fullMatch,
        text: norm(htmlToText(innerHTML)),
      });
    }
  }

  // Sort blocks by start index to keep them in document order
  blocks.sort((a, b) => a.start - b.start);
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

  // Find all matches (exact or prefix) and sort by proximity to blockIndex
  const exactMatches = [];
  const prefixMatches = [];
  const prefix = target.substring(0, 80);

  blocks.forEach((b, idx) => {
    if (b.text === target) {
      exactMatches.push({ block: b, index: idx });
    } else if (b.text.startsWith(prefix)) {
      prefixMatches.push({ block: b, index: idx });
    }
  });

  const targetIndex = (blockIndex !== null) ? blockIndex : 0;

  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => Math.abs(a.index - targetIndex) - Math.abs(b.index - targetIndex));
    return exactMatches[0].block;
  }

  if (prefixMatches.length > 0) {
    prefixMatches.sort((a, b) => Math.abs(a.index - targetIndex) - Math.abs(b.index - targetIndex));
    return prefixMatches[0].block;
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

/* ── Swap (mover bloque arriba/abajo) ─────────────────────── */

/**
 * Swap two same-tag blocks, keeping whatever sits between them intact.
 * `first` must appear before `second` in the HTML.
 *
 * Replaces: `<p>A</p>…<p>B</p>`  →  `<p>B</p>…<p>A</p>`
 *
 * @param {string} html
 * @param {string} firstTextContent   Text of the earlier block
 * @param {string} secondTextContent  Text of the later block
 * @param {string} [tagName='p']
 * @param {number|null} [firstIndex=null]
 * @param {number|null} [secondIndex=null]
 * @returns {{ original: string, replacement: string } | null}
 */
export function swapBlocks(html, firstTextContent, secondTextContent, tagName = 'p', firstIndex = null, secondIndex = null) {
  const first = findBlock(html, firstTextContent, tagName, firstIndex);
  const second = findBlock(html, secondTextContent, tagName, secondIndex);

  if (!first || !second) {
    console.warn('[BlockOps] swapBlocks: could not find one or both blocks.',
      { firstFound: !!first, secondFound: !!second });
    return null;
  }
  if (first.end > second.start) {
    console.warn('[BlockOps] swapBlocks: blocks overlap or are out of order.');
    return null;
  }

  const between = html.substring(first.end, second.start);
  return {
    original: html.substring(first.start, second.end),
    replacement: second.fullMatch + between + first.fullMatch,
  };
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

/* ── Espaciado por reglas GEO ─────────────────────────────── */
/*
 * El espaciado NUNCA se hace con margin inline: en Moodle el <p> ya se
 * auto-espacia (Bootstrap). Las únicas operaciones permitidas son:
 *   • </li><br><li>   — separar viñetas con mucho texto (citas, RED)
 *   • </ul><br><p>    — un <br> al salir de una lista hacia un párrafo
 *   • limpiar         — quitar margin inline y espaciadores vacíos heredados
 */

/**
 * Inspect the spacing situation around a block, to drive a rule-aware menu.
 *
 * @param {string} html
 * @param {string} textContent
 * @param {string} tagName
 * @param {number|null} blockIndex
 * @returns {{
 *   hasInlineMargin: boolean,
 *   nextIsLi: boolean, brBetweenLis: boolean,
 *   isLastInList: boolean, afterListIsP: boolean, brAfterList: boolean,
 * } | null}
 */
export function getSpacingContext(html, textContent, tagName = 'p', blockIndex = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) return null;

  const ctx = {
    hasInlineMargin: /margin-(?:bottom|top)\s*:/i.test(block.attrs),
    nextIsLi: false, brBetweenLis: false,
    isLastInList: false, afterListIsP: false, brAfterList: false,
  };

  if (tagName.toLowerCase() === 'li') {
    const after = html.substring(block.end);

    // ¿viñeta seguida de otra viñeta?
    const mNext = after.match(/^\s*((?:<br\s*\/?>\s*)*)<li\b/i);
    if (mNext) {
      ctx.nextIsLi = true;
      ctx.brBetweenLis = mNext[1] !== '';
    }

    // ¿última viñeta de la lista, y la lista va seguida de un <p>?
    const mClose = after.match(/^\s*<\/(ul|ol)>/i);
    if (mClose) {
      ctx.isLastInList = true;
      const afterList = after.substring(mClose[0].length);
      const mBr = afterList.match(/^((?:\s*<br\s*\/?>)*)\s*/i);
      ctx.brAfterList = /<br/i.test(mBr[1]);
      ctx.afterListIsP = /^<p\b/i.test(afterList.substring(mBr[0].length));
    }
  }

  return ctx;
}

/**
 * Insert or remove the single `<br>` between two `<li>` (regla:
 * viñetas con mucho texto / grupos de RED llevan `</li><br><li>`).
 *
 * @param {string} html
 * @param {string} textContent   Text of the FIRST li
 * @param {number|null} blockIndex
 * @param {boolean} add          true = insertar, false = quitar
 * @returns {{ original: string, replacement: string } | null}
 */
export function toggleBrBetweenLis(html, textContent, blockIndex = null, add = true) {
  const block = findBlock(html, textContent, 'li', blockIndex);
  if (!block) {
    console.warn('[BlockOps] toggleBrBetweenLis: could not find block.');
    return null;
  }

  const after = html.substring(block.end);
  const m = after.match(/^(\s*)((?:<br\s*\/?>\s*)*)(<li\b)/i);
  if (!m) return null;

  const hasBr = m[2] !== '';
  if (add === hasBr) return null;  // ya está en el estado pedido

  const original = block.fullMatch + m[0];
  const replacement = add
    ? block.fullMatch + '<br>' + m[1] + m[3]                    // </li><br> … <li>
    : block.fullMatch + m[0].replace(/<br\s*\/?>/gi, '');       // quitar solo los <br>,
                                                                // conservando la indentación

  return { original, replacement };
}

/**
 * Insert or remove the single `<br>` between `</ul>`/`</ol>` and the
 * following `<p>` (regla: al salir de una lista hacia un párrafo va un <br>;
 * es la ÚNICA transición entre bloques que lo lleva).
 *
 * Se invoca desde la última viñeta de la lista.
 *
 * @param {string} html
 * @param {string} textContent   Text of the LAST li in the list
 * @param {number|null} blockIndex
 * @param {boolean} add
 * @returns {{ original: string, replacement: string } | null}
 */
export function toggleBrAfterList(html, textContent, blockIndex = null, add = true) {
  const block = findBlock(html, textContent, 'li', blockIndex);
  if (!block) {
    console.warn('[BlockOps] toggleBrAfterList: could not find block.');
    return null;
  }

  const after = html.substring(block.end);
  const m = after.match(/^(\s*<\/(?:ul|ol)>)((?:\s*<br\s*\/?>)*)(\s*)(<p\b)/i);
  if (!m) return null;

  const hasBr = m[2] !== '';
  if (add === hasBr) return null;

  const original = block.fullMatch + m[0];
  const replacement = add
    ? block.fullMatch + m[1] + m[3] + '<br>' + m[3] + m[4]  // </ul>\n<br>\n<p>
    : block.fullMatch + m[1] + m[3] + m[4];                 // </ul>\n<p>

  return { original, replacement };
}

/**
 * Strip inline `margin-bottom` / `margin-top` from a block (código basura
 * heredado de cursos viejos: el espaciado correcto es estructural).
 * Drops the whole `style` attribute if it ends up empty.
 *
 * @param {string} html
 * @param {string} textContent
 * @param {string} [tagName='p']
 * @param {number|null} [blockIndex=null]
 * @returns {{ original: string, replacement: string } | null}
 */
export function removeInlineMargin(html, textContent, tagName = 'p', blockIndex = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] removeInlineMargin: could not find block.');
    return null;
  }
  if (!/margin-(?:bottom|top)\s*:/i.test(block.attrs)) return null;

  const cleanStyle = (styleVal) => styleVal
    .replace(/\s*margin-(?:bottom|top)\s*:\s*[^;"']+;?\s*/gi, '')
    .replace(/^\s*;\s*/, '').replace(/\s*;\s*$/, '').replace(/;\s*;/g, ';')
    .trim();

  let newAttrs = block.attrs
    .replace(/\s*style="([^"]*)"/i, (_m, v) => {
      const cleaned = cleanStyle(v);
      return cleaned ? ` style="${cleaned}"` : '';
    })
    .replace(/\s*style='([^']*)'/i, (_m, v) => {
      const cleaned = cleanStyle(v);
      return cleaned ? ` style='${cleaned}'` : '';
    });

  if (newAttrs === block.attrs) return null;

  return {
    original: block.fullMatch,
    replacement: `<${tagName}${newAttrs}>${block.innerHTML}</${tagName}>`,
  };
}

/* ── Insertar bloques nuevos ──────────────────────────────── */

/**
 * Insert a brand-new block right after the given one, keeping the source
 * indentation and the GEO clean-HTML rules (no inline styles, no spacers).
 *
 * Kinds:
 *  • 'p'  → `<p>Nuevo párrafo.</p>`
 *  • 'ul' → `<ul>` with one starter `<li>`
 *  • 'li' → a sibling `<li>` (only valid when the anchor block is an <li>)
 *
 * @param {string} html
 * @param {string} textContent   Text of the anchor block
 * @param {string} [tagName='p']
 * @param {number|null} [blockIndex=null]
 * @param {'p'|'ul'|'li'} [kind='p']
 * @returns {{ original: string, replacement: string } | null}
 */
export function insertBlockAfter(html, textContent, tagName = 'p', blockIndex = null, kind = 'p') {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] insertBlockAfter: could not find block.');
    return null;
  }

  // Una <li> nueva solo tiene sentido junto a otra <li>
  if (kind === 'li' && tagName.toLowerCase() !== 'li') return null;

  // Detect indentation of the anchor block
  const lineStart = html.lastIndexOf('\n', block.start);
  const indent = lineStart >= 0
    ? (html.substring(lineStart + 1, block.start).match(/^(\s*)/)?.[1] ?? '')
    : '';

  let snippet;
  if (kind === 'ul') {
    snippet = `<ul>\n${indent}<li>Nuevo elemento de lista.</li>\n${indent}<li>Otro elemento de lista.</li>\n${indent}</ul>`;
  } else if (kind === 'li') {
    snippet = '<li>Nueva viñeta.</li>';
  } else {
    snippet = '<p>Nuevo párrafo.</p>';
  }

  return {
    original: block.fullMatch,
    replacement: `${block.fullMatch}\n${indent}${snippet}`,
  };
}

/**
 * Strip every `<strong>` / `<b>` tag from a block, keeping the text
 * (eliminar negrilla a nivel de bloque).
 *
 * @param {string} html
 * @param {string} textContent
 * @param {string} [tagName='p']
 * @param {number|null} [blockIndex=null]
 * @returns {{ original: string, replacement: string } | null}
 */
export function removeBoldInBlock(html, textContent, tagName = 'p', blockIndex = null) {
  const block = findBlock(html, textContent, tagName, blockIndex);
  if (!block) {
    console.warn('[BlockOps] removeBoldInBlock: could not find block.');
    return null;
  }

  const cleanInner = block.innerHTML.replace(/<\/?(?:strong|b)\b[^>]*>/gi, '');
  if (cleanInner === block.innerHTML) return null;

  return {
    original: block.fullMatch,
    replacement: `<${tagName}${block.attrs}>${cleanInner}</${tagName}>`,
  };
}

/* ── Wrap standalone <strong> in <p> ─────────────────────── */

/**
 * Wrap a standalone `<strong>heading</strong>` (used as a block-level heading
 * but not inside any `<p>`) in a proper `<p>` block, consuming the trailing
 * `<br>` tags that were being used as spacers.
 *
 * Converts:  `<strong>Unidad 1: Texto</strong><br><br>`
 * Into:      `<p><strong>Unidad 1: Texto</strong></p>`
 *
 * @param {string} html          Full HTML string
 * @param {string} textContent   Plain text of the <strong> element
 * @returns {{ original: string, replacement: string } | null}
 */
export function wrapStrongInParagraph(html, textContent) {
  const target = norm(textContent);
  if (!target) return null;

  // Match <strong (attrs)>inner</strong> followed by optional whitespace + <br> tags
  const re = /<strong(\b[^>]*)>([\s\S]*?)<\/strong>((?:\s*<br\s*\/?>)*)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const innerText = norm(htmlToText(m[2]));
    if (innerText !== target && !innerText.startsWith(target.substring(0, 40))) continue;

    // The strong heading + its trailing <br> tags.
    const original = m[0];

    // Wrap the <strong> in a <p>. In Moodle the <p> already carries its own
    // natural margin (no inline styles needed), and the trailing <br> tags are
    // dropped because the paragraph spacing replaces them.
    const replacement = `<p><strong${m[1]}>${m[2]}</strong></p>`;
    return { original, replacement };
  }
  return null;
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

  // Pattern A: Match a leading empty spacer element (<br>, <p><br></p>, etc.) after the block,
  // potentially past closing list tags (</ul>, </li>).
  const siblingSpacerRegex = /^(\s*(?:<\/(?:ul|ol|li)>\s*)*)(?:(<br\s*\/?>)|<([a-z1-6]+)\b([^>]*)>\s*(?:<br\s*\/?>|&nbsp;|\s*)*<\/\3>)/i;
  const matchA = afterBlock.match(siblingSpacerRegex);
  if (matchA) {
    const fullMatch = matchA[0];
    const capturedClosingTags = matchA[1];
    return {
      original: block.fullMatch + fullMatch,
      replacement: block.fullMatch + capturedClosingTags,
    };
  }

  // Pattern B: Match a leading <br> inside the next block element (e.g. <h4 class="mb-4"><br>Text</h4>).
  const leadingBrRegex = /^(\s*<([a-z1-6]+)\b([^>]*)>)\s*<br\s*\/?>/i;
  const matchB = afterBlock.match(leadingBrRegex);
  if (matchB) {
    const fullMatch = matchB[0];
    const openingTag = matchB[1];
    return {
      original: block.fullMatch + fullMatch,
      replacement: block.fullMatch + openingTag,
    };
  }

  return null;
}
