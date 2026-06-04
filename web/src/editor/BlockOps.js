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

/** Strip HTML tags and decode common entities to get plain text. */
function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
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
export function findBlock(html, textContent, tagName = 'p') {
  const target = norm(textContent);
  if (!target) return null;

  const blocks = parseAllBlocks(html, tagName);

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
export function mergeBlocks(html, currTextContent, prevTextContent, tagName = 'p') {
  const prevBlock = findBlock(html, prevTextContent, tagName);
  const currBlock = findBlock(html, currTextContent, tagName);

  if (!prevBlock || !currBlock) {
    console.warn('[BlockOps] mergeBlocks: could not find one or both blocks.',
      { prevFound: !!prevBlock, currFound: !!currBlock });
    return null;
  }

  if (prevBlock.start >= currBlock.start) {
    console.warn('[BlockOps] mergeBlocks: prev is not before curr.');
    return null;
  }

  // Safety: only merge if the content between them is whitespace-only
  const between = html.substring(prevBlock.end, currBlock.start).trim();
  if (between.length > 0) {
    console.warn('[BlockOps] mergeBlocks: non-whitespace between blocks:', between.substring(0, 100));
    return null;
  }

  // Replace both blocks + whitespace with one merged block
  const original = html.substring(prevBlock.start, currBlock.end);
  const merged = `<${tagName}${prevBlock.attrs}>${prevBlock.innerHTML} ${currBlock.innerHTML}</${tagName}>`;

  return { original, replacement: merged };
}

/* ── Split ────────────────────────────────────────────────── */

/**
 * Convert a plain-text offset to an HTML offset inside innerHTML,
 * skipping over HTML tags and counting decoded entities as 1 char.
 */
function textOffsetToHtmlOffset(innerHTML, textOffset) {
  let textCount = 0;
  let i = 0;
  const len = innerHTML.length;

  while (i < len && textCount < textOffset) {
    if (innerHTML[i] === '<') {
      while (i < len && innerHTML[i] !== '>') i++;
      i++;
      continue;
    }
    if (innerHTML[i] === '&') {
      const semi = innerHTML.indexOf(';', i);
      if (semi !== -1 && semi - i < 10) {
        textCount++;
        i = semi + 1;
        continue;
      }
    }
    textCount++;
    i++;
  }
  return i;
}

/**
 * Split a block element into two at the given text offset.
 *
 * @param {string} html            Full HTML string
 * @param {string} textContent     Text content of the block
 * @param {number} splitTextOffset Offset in plain-text chars
 * @param {string} [tagName='p']
 * @returns {{ original: string, replacement: string } | null}
 */
export function splitBlock(html, textContent, splitTextOffset, tagName = 'p') {
  const block = findBlock(html, textContent, tagName);
  if (!block) {
    console.warn('[BlockOps] splitBlock: could not find block.');
    return null;
  }

  const htmlOffset = textOffsetToHtmlOffset(block.innerHTML, splitTextOffset);

  let before = block.innerHTML.substring(0, htmlOffset);
  let after = block.innerHTML.substring(htmlOffset);

  // Trim trailing/leading whitespace and <br> at the split point
  before = before.replace(/(\s|<br\s*\/?>)+$/gi, '');
  after = after.replace(/^(\s|<br\s*\/?>)+/gi, '');

  // Detect indentation
  const lineStart = html.lastIndexOf('\n', block.start);
  const indent = lineStart >= 0
    ? (html.substring(lineStart + 1, block.start).match(/^(\s*)/)?.[1] ?? '')
    : '';

  const original = block.fullMatch;
  const replacement =
    `<${tagName}${block.attrs}>${before}</${tagName}>\n` +
    `${indent}<${tagName}${block.attrs}>${after}</${tagName}>`;

  return { original, replacement };
}
