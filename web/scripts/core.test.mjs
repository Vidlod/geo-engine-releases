/**
 * Tests unitarios del núcleo nuevo: Engine (undo/redo/historial),
 * quick-fixes del linter, diff por líneas y swap de bloques.
 *
 * Uso:  node scripts/core.test.mjs
 */
process.chdir(new URL('..', import.meta.url).pathname);

import { Engine } from '../src/editor/Engine.js';
import { getQuickFix, FIXABLE_RULES } from '../src/linter/fixes.js';
import { computeLineDiff, buildHunks } from '../src/ui/DiffView.js';
import { swapBlocks } from '../src/editor/BlockOps.js';
import { ForbiddenSourceRule, PluginfileRedRule } from '../src/linter/rules/links.js';

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`);
  if (!cond) failures++;
};

/* ── Engine: undo / redo / revertTo / labels ──────────────── */
console.log('— Engine —');
{
  const e = new Engine();
  e.load('<p>uno</p><p>dos</p><p>tres</p>');
  e.addPatch('uno', 'UNO', 'Cambio A');
  e.addPatch('dos', 'DOS', 'Cambio B');
  e.addPatch('tres', 'TRES', 'Cambio C');

  check('3 parches con labels', e.patches.map((p) => p.label).join(',') === 'Cambio A,Cambio B,Cambio C');
  check('resultado con los 3', e.getResult() === '<p>UNO</p><p>DOS</p><p>TRES</p>');

  const undone = e.undo();
  check('undo devuelve el parche con label', undone.label === 'Cambio C');
  check('canRedo tras undo', e.canRedo === true);
  check('resultado sin el 3º', e.getResult() === '<p>UNO</p><p>DOS</p><p>tres</p>');

  const redone = e.redo();
  check('redo restaura el parche', redone.label === 'Cambio C' && e.patchCount === 3);
  check('canRedo agotado', e.canRedo === false);

  e.undo(); e.undo();
  check('nuevo parche limpia el redo', (e.addPatch('UNO', 'Uno', 'Cambio D'), e.canRedo === false));

  const e2 = new Engine();
  e2.load('abcd');
  e2.addPatch('a', 'A', '1'); e2.addPatch('b', 'B', '2'); e2.addPatch('c', 'C', '3');
  const n = e2.revertTo(1);
  check('revertTo(1) deshace 2', n === 2 && e2.patchCount === 1 && e2.getResult() === 'Abcd');
  e2.redo();
  check('redo tras revertTo recupera en orden', e2.getResult() === 'ABcd');
}

/* ── Quick-fixes ──────────────────────────────────────────── */
console.log('— Quick-fixes —');
{
  check('8 reglas con fixer', FIXABLE_RULES.size === 8);

  // max-br: colapsar el run correcto (hay dos idénticos; el finding apunta al 2º)
  const html1 = '<p>a</p>\n<br><br>\n<p>b</p>\n<br><br>\n<p>c</p>';
  const fix1 = getQuickFix(html1, { ruleId: 'max-br', line: 4, message: '' });
  check('max-br genera fix', !!fix1);
  check('max-br: el parche es único en el doc', fix1 && html1.indexOf(fix1.original) === html1.lastIndexOf(fix1.original));
  check('max-br: colapsa a un <br>', fix1 && html1.replace(fix1.original, fix1.replacement) === '<p>a</p>\n<br><br>\n<p>b</p>\n<br>\n<p>c</p>');

  // br-between-blocks: respeta la excepción lista→párrafo
  const html2 = '<ul><li>x</li></ul><br><p>ok</p>\n<p>y</p><br><p>z</p>';
  const fix2 = getQuickFix(html2, { ruleId: 'br-between-blocks', line: 1, message: '' });
  check('br-between-blocks: salta lista→p y corrige </p><br><p>',
    fix2 && html2.replace(fix2.original, fix2.replacement).includes('<p>y</p><p>z</p>') &&
    html2.replace(fix2.original, fix2.replacement).includes('</ul><br><p>ok</p>'));

  // link-target: añade target y rel
  const html3 = '<p><a href="https://example.com">sitio</a></p>';
  const fix3 = getQuickFix(html3, { ruleId: 'link-target', line: 1, message: '' });
  check('link-target: añade target/rel',
    fix3 && html3.replace(fix3.original, fix3.replacement)
      .includes('<a href="https://example.com" target="_blank" rel="noopener">'));

  // elibro-proxy
  const html4 = '<a href="https://elibronet.ezproxy.udes.edu.co/x">l</a>';
  const fix4 = getQuickFix(html4, { ruleId: 'elibro-proxy', line: 1, message: '' });
  check('elibro-proxy: corrige el dominio',
    fix4 && html4.replace(fix4.original, fix4.replacement).includes('elibro-net.ezproxy.udes.edu.co'));

  // forbidden-source: draftfile → @@PLUGINFILE@@
  const html5 = '<a href="https://campus.udes.edu.co/draftfile.php/55/user/draft/77/Guia%20AAA.pdf">guía</a>';
  const fix5 = getQuickFix(html5, { ruleId: 'forbidden-source', line: 1, message: 'Enlace a draftfile.php' });
  check('forbidden-source: deriva el nombre del archivo',
    fix5 && html5.replace(fix5.original, fix5.replacement).includes('href="@@PLUGINFILE@@/Guia AAA.pdf"'));

  // forbidden-source OneDrive: SIN fix automático
  const fix6 = getQuickFix(html5, { ruleId: 'forbidden-source', line: 1, message: 'Enlace a OneDrive/SharePoint (prohibido)' });
  check('forbidden-source OneDrive: sin fix', fix6 === null);

  // regla sin fixer
  check('no-italics: sin fix', getQuickFix('<em>x</em>', { ruleId: 'no-italics', line: 1, message: '' }) === null);
}

/* ── Reglas de enlaces nuevas ─────────────────────────────── */
console.log('— Reglas de enlaces —');
{
  const r1 = new ForbiddenSourceRule();
  const f1 = r1.check('<a href="x/draftfile.php/1/a.pdf">a</a> <a href="https://udes-my.sharepoint.com/doc">b</a>');
  check('forbidden-source detecta draftfile y sharepoint', f1.length === 2);

  const red = ['Guia de estudio.pdf'];
  const r2 = new PluginfileRedRule({ redFiles: red });
  const f2 = r2.check('<a href="@@PLUGINFILE@@/Guia%20de%20estudio.pdf">ok</a> <a href="@@PLUGINFILE@@/Otro.pdf">mal</a>');
  check('pluginfile-red: acepta el RED registrado (con %20) y marca el desconocido',
    f2.length === 1 && f2[0].message.includes('Otro.pdf'));

  const r3 = new PluginfileRedRule({ redFiles: [] });
  check('pluginfile-red: sin lista RED no opina', r3.check('<a href="@@PLUGINFILE@@/x.pdf">x</a>').length === 0);
}

/* ── Diff por líneas ──────────────────────────────────────── */
console.log('— Diff —');
{
  const a = 'l1\nl2\nl3\nl4\nl5';
  const b = 'l1\nl2-mod\nl3\nl4\nl5\nl6';
  const ops = computeLineDiff(a, b);
  const dels = ops.filter((o) => o.type === 'del');
  const adds = ops.filter((o) => o.type === 'add');
  check('detecta 1 línea quitada y 2 añadidas', dels.length === 1 && adds.length === 2);
  check('línea modificada correcta', dels[0].text === 'l2' && adds.some((o) => o.text === 'l2-mod'));
  check('sin diferencias → solo ctx', computeLineDiff(a, a).every((o) => o.type === 'ctx'));

  const hunks = buildHunks(ops, 1);
  check('hunks solo alrededor de cambios', hunks.length >= 1 && hunks.flat().length < ops.length + 3);
}

/* ── swapBlocks ───────────────────────────────────────────── */
console.log('— swapBlocks —');
{
  const html = '<div>\n  <p>primero</p>\n  <p>segundo</p>\n</div>';
  const patch = swapBlocks(html, 'primero', 'segundo', 'p', 0, 1);
  check('intercambia bloques conservando el medio',
    patch && html.replace(patch.original, patch.replacement) === '<div>\n  <p>segundo</p>\n  <p>primero</p>\n</div>');

  check('rechaza orden invertido', swapBlocks(html, 'segundo', 'primero', 'p', 1, 0) === null);

  const lis = '<ul>\n  <li>uno</li>\n  <li>dos</li>\n</ul>';
  const p2 = swapBlocks(lis, 'uno', 'dos', 'li', 0, 1);
  check('funciona con <li>',
    p2 && lis.replace(p2.original, p2.replacement) === '<ul>\n  <li>dos</li>\n  <li>uno</li>\n</ul>');
}

console.log(failures === 0 ? '\nCORE OK' : `\nCORE FALLÓ: ${failures} aserciones`);
process.exit(failures === 0 ? 0 : 1);
