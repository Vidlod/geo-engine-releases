/**
 * Tests de las operaciones de espaciado por reglas GEO (BlockOps).
 *
 * Verifica que el editor produce EXACTAMENTE los patrones de las skills:
 *   • </li><br><li>  — separar viñetas pesadas / RED
 *   • </ul><br><p>   — única transición entre bloques con <br>
 *   • limpieza de margin inline y espaciadores (sin tocar otros estilos)
 *
 * Uso:  node scripts/blockops.test.mjs
 */
import {
  getSpacingContext,
  toggleBrBetweenLis,
  toggleBrAfterList,
  removeInlineMargin,
} from '../src/editor/BlockOps.js';

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`);
  if (!cond) failures++;
};

/** Aplica un patch {original, replacement} sobre el html (como Engine.addPatch). */
const apply = (html, patch) => html.replace(patch.original, patch.replacement);

console.log('— getSpacingContext —');
{
  const html = '<ul>\n<li>Cita uno con texto largo.</li>\n<li>Cita dos.</li>\n</ul>\n<p>Sigue.</p>';
  const c1 = getSpacingContext(html, 'Cita uno con texto largo.', 'li', 0);
  check('viñeta con siguiente, sin <br>', c1.nextIsLi === true && c1.brBetweenLis === false);
  const c2 = getSpacingContext(html, 'Cita dos.', 'li', 1);
  check('última viñeta: lista seguida de <p>, sin <br>',
    c2.isLastInList && c2.afterListIsP && !c2.brAfterList);

  const html2 = '<ul><li>a con texto suficiente.</li><br><li>b también larga.</li></ul><br><p>x.</p>';
  const c3 = getSpacingContext(html2, 'a con texto suficiente.', 'li', 0);
  check('detecta <br> existente entre viñetas', c3.brBetweenLis === true);
  const c4 = getSpacingContext(html2, 'b también larga.', 'li', 1);
  check('detecta <br> existente tras la lista', c4.brAfterList === true);

  const html3 = '<p style="margin-bottom: 26px;">Texto con margen inline aquí.</p>';
  const c5 = getSpacingContext(html3, 'Texto con margen inline aquí.', 'p', 0);
  check('detecta margin inline', c5.hasInlineMargin === true);
}

console.log('— toggleBrBetweenLis —');
{
  const html = '<ul>\n    <li>Autor (2024). Título uno.</li>\n    <li>Autor (2025). Título dos.</li>\n</ul>';
  const add = toggleBrBetweenLis(html, 'Autor (2024). Título uno.', 0, true);
  check('inserta patch', !!add);
  const added = apply(html, add);
  check('produce </li><br> … <li>', /<\/li><br>\s*<li>/.test(added));
  check('no duplica si ya existe', toggleBrBetweenLis(added, 'Autor (2024). Título uno.', 0, true) === null);

  const rm = toggleBrBetweenLis(added, 'Autor (2024). Título uno.', 0, false);
  check('quitar restaura el original', apply(added, rm) === html);
}

console.log('— toggleBrAfterList —');
{
  const html = '<ul>\n    <li>Única viñeta de la lista.</li>\n</ul>\n<p>Párrafo que sigue.</p>';
  const add = toggleBrAfterList(html, 'Única viñeta de la lista.', 0, true);
  check('inserta patch', !!add);
  const added = apply(html, add);
  check('produce </ul> … <br> … <p>', /<\/ul>\s*<br>\s*<p>/.test(added));
  check('no duplica si ya existe', toggleBrAfterList(added, 'Única viñeta de la lista.', 0, true) === null);

  const rm = toggleBrAfterList(added, 'Única viñeta de la lista.', 0, false);
  check('quitar restaura el original', apply(added, rm) === html);

  // Forma compacta (como sale del linter de cursos viejos)
  const compact = '<ul><li>Item compacto de prueba.</li></ul><br><p>fin.</p>';
  const rm2 = toggleBrAfterList(compact, 'Item compacto de prueba.', 0, false);
  check('quita <br> en forma compacta', apply(compact, rm2) === '<ul><li>Item compacto de prueba.</li></ul><p>fin.</p>');

  // No aplica si lo que sigue a la lista no es <p>
  const noP = '<ul><li>Item sin párrafo después.</li></ul><ul><li>otra.</li></ul>';
  check('no aplica lista→lista', toggleBrAfterList(noP, 'Item sin párrafo después.', 0, true) === null);
}

console.log('— removeInlineMargin —');
{
  const html = '<p style="margin-bottom: 26px;">Solo margen, nada más aquí.</p>';
  const p1 = removeInlineMargin(html, 'Solo margen, nada más aquí.', 'p', 0);
  check('elimina style completo si queda vacío', apply(html, p1) === '<p>Solo margen, nada más aquí.</p>');

  const mixed = '<p style="color: red; margin-bottom: 26px;">Margen mezclado con color.</p>';
  const p2 = removeInlineMargin(mixed, 'Margen mezclado con color.', 'p', 0);
  const cleaned = apply(mixed, p2);
  check('conserva las demás propiedades', cleaned.includes('color: red') && !/margin-bottom/.test(cleaned));

  const both = '<p style="margin-top: 10px; margin-bottom: 26px;">Ambos márgenes inline.</p>';
  const p3 = removeInlineMargin(both, 'Ambos márgenes inline.', 'p', 0);
  check('elimina margin-top y margin-bottom', apply(both, p3) === '<p>Ambos márgenes inline.</p>');

  const clean = '<p>Sin estilos en absoluto.</p>';
  check('no aplica si no hay margin', removeInlineMargin(clean, 'Sin estilos en absoluto.', 'p', 0) === null);
}

console.log(failures === 0 ? '\nBLOCKOPS OK' : `\nBLOCKOPS FALLÓ: ${failures} aserciones`);
process.exit(failures === 0 ? 0 : 1);
