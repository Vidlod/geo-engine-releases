/**
 * @module linter/fixes
 * Quick-fix generators for mechanical linter findings.
 *
 * Each fixer re-detects its pattern in the CURRENT html near the finding's
 * line and returns a `{ original, replacement, label }` patch compatible with
 * `Engine.addPatch()`.  Because the engine replaces the FIRST occurrence of
 * `original`, every patch is widened with surrounding context until it is
 * unique in the document — so the fix always lands on the reported spot.
 *
 * Only mechanical, rule-unambiguous corrections get a fixer.  Anything that
 * needs human judgement (no-italics, terminology, missing RED file…) stays
 * check-only.
 */

/* ── Position helpers ─────────────────────────────────────── */

/**
 * 0-based character index where a 1-based line starts.
 * @param {string} html
 * @param {number} line
 * @returns {number}
 */
function lineStartIndex(html, line) {
  if (line <= 1) return 0;
  let idx = 0;
  for (let n = 1; n < line; n++) {
    idx = html.indexOf('\n', idx);
    if (idx === -1) return 0;
    idx++;
  }
  return idx;
}

/**
 * Run `re` (global) over `html` and return the match the finding refers to:
 * the first one that OVERLAPS or follows position `from` (the start of the
 * finding's line).  Scanning from the top and filtering by end-position avoids
 * grabbing an identical earlier violation.
 * @param {string} html
 * @param {RegExp} re      — must have the `g` flag
 * @param {number} from
 * @returns {RegExpExecArray|null}
 */
function execNear(html, re, from) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m.index + m[0].length > from) return m;
    if (m[0].length === 0) re.lastIndex++; // seguridad ante matches vacíos
  }
  return null;
}

/**
 * Widen `[start, end)` with surrounding context until the substring is unique
 * in `html`, then build the patch strings.
 * @param {string} html
 * @param {number} start
 * @param {number} end
 * @param {string} fixed — replacement for html.slice(start, end)
 * @returns {{ original: string, replacement: string }}
 */
function uniquePatch(html, start, end, fixed) {
  let s = start;
  let e = end;
  let str = html.slice(s, e);
  while (
    html.indexOf(str) !== html.lastIndexOf(str) &&
    (s > 0 || e < html.length)
  ) {
    s = Math.max(0, s - 40);
    e = Math.min(html.length, e + 40);
    str = html.slice(s, e);
  }
  return {
    original: str,
    replacement: html.slice(s, start) + fixed + html.slice(end, e),
  };
}

/* ── Fixers (uno por regla mecánica) ──────────────────────── */

/** @typedef {{ original: string, replacement: string, label: string }} QuickFix */

/** @type {Record<string, (html: string, finding: any) => QuickFix|null>} */
const FIXERS = {
  /** Run de <br> repetidos → un solo <br>. */
  'max-br'(html, f) {
    const m = execNear(html, /(?:<br\s*\/?>\s*){2,}/gi, lineStartIndex(html, f.line));
    if (!m) return null;
    const trailingWs = m[0].match(/\s*$/)?.[0] ?? '';
    const patch = uniquePatch(html, m.index, m.index + m[0].length, '<br>' + trailingWs);
    return { ...patch, label: 'Colapsar <br> repetidos' };
  },

  /** <br> antes de cerrar bloque → quitar los <br>. */
  'br-before-close'(html, f) {
    const m = execNear(html, /(?:<br\s*\/?>\s*)+(<\/(?:li|ul|ol|div)>)/gi, lineStartIndex(html, f.line));
    if (!m) return null;
    const patch = uniquePatch(html, m.index, m.index + m[0].length, m[1]);
    return { ...patch, label: `Quitar <br> antes de ${m[1]}` };
  },

  /** <br> entre bloques → quitarlo (respetando la excepción lista→párrafo). */
  'br-between-blocks'(html, f) {
    const from = lineStartIndex(html, f.line);
    const re = /(<\/(?:p|ul|ol)>)(\s*(?:<br\s*\/?>\s*)+)(<(?:p|ul|ol)\b)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m.index + m[0].length <= from) continue; // ocurrencia anterior al hallazgo
      const close = m[1].toLowerCase();
      const isListToP = (close === '</ul>' || close === '</ol>') && m[3].toLowerCase().startsWith('<p');
      if (isListToP) continue; // transición permitida — no es lo que reportó la regla
      const fixed = m[1] + m[2].replace(/<br\s*\/?>/gi, '') + m[3];
      const patch = uniquePatch(html, m.index, m.index + m[0].length, fixed);
      return { ...patch, label: 'Quitar <br> entre bloques' };
    }
    return null;
  },

  /** <br> antes de un div centrado (botón) → quitar los <br>. */
  'br-before-button'(html, f) {
    const m = execNear(html, /(?:<br\s*\/?>\s*)+(<div[^>]*text-align:\s*center[^>]*>)/gi, lineStartIndex(html, f.line));
    if (!m) return null;
    const patch = uniquePatch(html, m.index, m.index + m[0].length, m[1]);
    return { ...patch, label: 'Quitar <br> antes del botón' };
  },

  /** Espacios repetidos → uno solo. */
  'max-spaces'(html, f) {
    const m = execNear(html, /(\S) {3,}/g, lineStartIndex(html, f.line));
    if (!m) return null;
    const patch = uniquePatch(html, m.index, m.index + m[0].length, m[1] + ' ');
    return { ...patch, label: 'Colapsar espacios repetidos' };
  },

  /** Dominio eLibro sin guion → con guion. */
  'elibro-proxy'(html, f) {
    const BAD = 'elibronet.ezproxy.udes.edu.co';
    const from = lineStartIndex(html, f.line);
    let idx = html.indexOf(BAD);
    while (idx !== -1 && idx + BAD.length <= from) idx = html.indexOf(BAD, idx + 1);
    if (idx === -1) return null;
    const patch = uniquePatch(html, idx, idx + BAD.length, 'elibro-net.ezproxy.udes.edu.co');
    return { ...patch, label: 'Corregir dominio eLibro' };
  },

  /** Enlace sin target/rel → añadir target="_blank" rel="noopener". */
  'link-target'(html, f) {
    const from = lineStartIndex(html, f.line);
    const re = /<a\b([^>]*)>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m.index + m[0].length <= from) continue; // ocurrencia anterior al hallazgo
      const attrs = m[1];
      const href = /href\s*=\s*"(.*?)"/i.exec(attrs)?.[1] ?? '';
      if (href.startsWith('#')) continue;
      const hasTarget = /target\s*=/i.test(attrs);
      const hasRel = /rel\s*=/i.test(attrs);
      if (hasTarget && hasRel) continue; // este <a> está bien; buscar el siguiente

      let extras = '';
      if (!hasTarget) extras += ' target="_blank"';
      if (!hasRel) extras += ' rel="noopener"';
      const fixed = `<a${attrs}${extras}>`;
      const patch = uniquePatch(html, m.index, m.index + m[0].length, fixed);
      return { ...patch, label: 'Añadir target/rel al enlace' };
    }
    return null;
  },

  /**
   * draftfile.php → @@PLUGINFILE@@/<archivo> (el nombre real viene al final
   * de la URL del borrador).  Los enlaces OneDrive/SharePoint NO se
   * auto-corrigen: el nombre del archivo no es derivable.
   */
  'forbidden-source'(html, f) {
    // Solo el caso draftfile es derivable; un hallazgo de OneDrive no debe
    // disparar este fixer aunque haya un draftfile más adelante.
    if (!/draftfile/i.test(f.message ?? '')) return null;
    const m = execNear(html, /(href\s*=\s*")([^"]*draftfile\.php[^"]*)(")/gi, lineStartIndex(html, f.line));
    if (!m) return null;

    const url = m[2];
    let name = url.split('/').pop()?.split('?')[0] ?? '';
    try { name = decodeURIComponent(name); } catch { /* keep raw */ }
    if (!name) return null;

    const fixed = `${m[1]}@@PLUGINFILE@@/${name}${m[3]}`;
    const patch = uniquePatch(html, m.index, m.index + m[0].length, fixed);
    return { ...patch, label: `draftfile → @@PLUGINFILE@@/${name}` };
  },
};

/* ── Public API ───────────────────────────────────────────── */

/** Rule ids that have a quick fix. */
export const FIXABLE_RULES = new Set(Object.keys(FIXERS));

/**
 * Compute the quick fix for a finding against the CURRENT html.
 * @param {string} html
 * @param {{ ruleId?: string, rule_id?: string, line: number, snippet?: string }} finding
 * @returns {QuickFix|null}
 */
export function getQuickFix(html, finding) {
  const ruleId = finding.ruleId ?? finding.rule_id;
  const fixer = FIXERS[ruleId];
  if (!fixer) return null;
  try {
    return fixer(html, finding);
  } catch (err) {
    console.warn('[fixes] fixer failed for', ruleId, err);
    return null;
  }
}
