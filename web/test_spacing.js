import { getBaseline, addSpaceAfter, removeSpaceAfter, findBlock, splitBlock, parseAllBlocks, removeFollowerSpacer } from './src/editor/BlockOps.js';

console.log('--- TEST 1: getBaseline ---');
console.log('baseline for h4 with mb-4 class:', getBaseline('h4', 'mb-4 block-selected'));
console.log('baseline for h4 with class="mb-4" attribute:', getBaseline('h4', ' class="mb-4"'));

console.log('\n--- TEST 2: Spacing reduction on H4 mb-4 ---');
const htmlH4 = `<h4 class="mb-4"><br>Condiciones Particulares de Entrega</h4>\n<p>Next paragraph</p>`;
console.log('Original H4 HTML:\n', htmlH4);

// Simulate _doRemoveSpace
const blockText = 'Condiciones Particulares de Entrega';
const baseline = getBaseline('h4', 'mb-4 block-selected');
console.log('baseline in _doRemoveSpace:', baseline);

// 1. removeSpaceAfter should return null (no inline style)
const patch1 = removeSpaceAfter(htmlH4, blockText, 'h4', 0);
console.log('patch1 from removeSpaceAfter:', patch1);

// 2. Fallback 3 should run: newVal = Math.max(0, baseline - 10) = 14
const newVal = Math.max(0, baseline - 10);
console.log('newVal for Fallback 3:', newVal);
const patch2 = addSpaceAfter(htmlH4, blockText, 'h4', 0, newVal);
console.log('patch2 from addSpaceAfter:', patch2);

// Replay patch2
let patchedHtml = htmlH4.replace(patch2.original, patch2.replacement);
console.log('Patched HTML after first click:\n', patchedHtml);

// 3. Second click: removeSpaceAfter should decrease it to 4px
const patch3 = removeSpaceAfter(patchedHtml, blockText, 'h4', 0);
console.log('patch3 from removeSpaceAfter (second click):', patch3);
patchedHtml = patchedHtml.replace(patch3.original, patch3.replacement);
console.log('Patched HTML after second click:\n', patchedHtml);

// 4. Third click: removeSpaceAfter should decrease it to 0px
const patch4 = removeSpaceAfter(patchedHtml, blockText, 'h4', 0);
console.log('patch4 from removeSpaceAfter (third click):', patch4);
patchedHtml = patchedHtml.replace(patch4.original, patch4.replacement);
console.log('Patched HTML after third click:\n', patchedHtml);


console.log('\n--- TEST 3: Split Block Spacing ---');
const htmlSplit = `<p style="text-align: justify;">This is first part. And this is second part.</p>`;
console.log('Original HTML:\n', htmlSplit);

const splitPatch = splitBlock(htmlSplit, 'This is first part. And this is second part.', 20, 'p', 0);
console.log('splitPatch:\n', splitPatch);

let afterSplitHtml = htmlSplit.replace(splitPatch.original, splitPatch.replacement);
console.log('HTML after split:\n', afterSplitHtml);

// Try removing space from the first part "This is first part."
const blockTextPart1 = 'This is first part.';
const baselinePart1 = getBaseline('p', '');
console.log('Part 1 baseline:', baselinePart1);

// removeSpaceAfter should return null (no inline margin-bottom)
const part1Patch1 = removeSpaceAfter(afterSplitHtml, blockTextPart1, 'p', 0);
console.log('part1Patch1 (removeSpaceAfter):', part1Patch1);

// Fallback 3: newVal = 6
const part1NewVal = Math.max(0, baselinePart1 - 10);
const part1Patch2 = addSpaceAfter(afterSplitHtml, blockTextPart1, 'p', 0, part1NewVal);
console.log('part1Patch2 (addSpaceAfter):', part1Patch2);
afterSplitHtml = afterSplitHtml.replace(part1Patch2.original, part1Patch2.replacement);
console.log('HTML after removing space from first part:\n', afterSplitHtml);


console.log('\n--- TEST 4: Real HTML File Split & Spacing ---');
import fs from 'fs';
const realHtml = fs.readFileSync('/Users/buc-cvudes-medios1/Documents/GEO/PLANTILLA_CURSO/3_paginas_finales/Momentos/Momento Evaluativo1.html', 'utf8');

// Let's count paragraphs in the real HTML
const blocksBefore = parseAllBlocks(realHtml, 'p');
console.log('Number of <p> blocks in HTML before split:', blocksBefore.length);

// We will split paragraph at index 14
const targetP = blocksBefore[14];
console.log('Target Paragraph at index 14 text:\n', targetP.text);

// Split target paragraph in the middle
const splitOffset = Math.floor(targetP.text.length / 2);
const splitP = splitBlock(realHtml, targetP.text, splitOffset, 'p', 14);
console.log('splitP patch created successfully:', !!splitP);

// Apply split patch
let realHtmlPatched = realHtml.replace(splitP.original, splitP.replacement);

// Now count paragraphs after split
const blocksAfter = parseAllBlocks(realHtmlPatched, 'p');
console.log('Number of <p> blocks in HTML after split:', blocksAfter.length);

// The first part of the split is at index 14, second part at index 15.
const rpart1 = blocksAfter[14];
const rpart2 = blocksAfter[15];
console.log('Part 1 text:', rpart1.text);
console.log('Part 2 text:', rpart2.text);

// Simulate removeSpaceAfter on Part 1
const rpart1RemovePatch = removeSpaceAfter(realHtmlPatched, rpart1.text, 'p', 14);
console.log('Part 1 removeSpaceAfter patch:', rpart1RemovePatch);

// Fallback 3 simulation: newVal = 6
const rpart1Baseline = getBaseline('p', rpart1.attrs);
console.log('Part 1 baseline:', rpart1Baseline);
const rpart1NewVal = Math.max(0, rpart1Baseline - 10);
const rpart1AddPatch = addSpaceAfter(realHtmlPatched, rpart1.text, 'p', 14, rpart1NewVal);
console.log('Part 1 addSpaceAfter patch:', rpart1AddPatch);

// Apply Part 1 addSpaceAfter patch
realHtmlPatched = realHtmlPatched.replace(rpart1AddPatch.original, rpart1AddPatch.replacement);
console.log('Part 1 space reduced successfully.');

// Simulate removeSpaceAfter on Part 2
const rpart2RemovePatch = removeSpaceAfter(realHtmlPatched, rpart2.text, 'p', 15);
console.log('Part 2 removeSpaceAfter patch:', rpart2RemovePatch);

const rpart2Baseline = getBaseline('p', rpart2.attrs);
console.log('Part 2 baseline:', rpart2Baseline);
const rpart2NewVal = Math.max(0, rpart2Baseline - 10);
const rpart2AddPatch = addSpaceAfter(realHtmlPatched, rpart2.text, 'p', 15, rpart2NewVal);
console.log('Part 2 addSpaceAfter patch:', rpart2AddPatch);


console.log('\n--- TEST 5: Proximity-based block matching ---');
const duplicateHtml = `
<!-- <p>Commented block</p> -->
<p>Documento:</p>
<p>Some text 1</p>
<p>Some text 2</p>
<p>Documento:</p>
`;
console.log('HTML with duplicate blocks:\n', duplicateHtml.trim());

// We click on the second "Documento:" block in the DOM.
// In the DOM, this has index 3 (since there's no commented block in the DOM: 0: Documento, 1: Some text 1, 2: Some text 2, 3: Documento).
// In the HTML string (including comments), the second "Documento:" is at index 4 (0: Commented block, 1: Documento, 2: Some text 1, 3: Some text 2, 4: Documento).
// So targetIndex/blockIndex is passed as 3.
// The candidates for "Documento:" in HTML are at index 1 and index 4.
// Proximity search should select index 4 because |4 - 3| = 1 < |1 - 3| = 2.
const matchedBlock = findBlock(duplicateHtml, 'Documento:', 'p', 3);
console.log('Expected: block at HTML index 4 (text: "Documento:", should start around index 94)');
console.log('Result matched block:', matchedBlock ? { start: matchedBlock.start, text: matchedBlock.text } : null);
// Let's compute expected start:
// Lengths:
// Newline (1) + comment (33) + newline (1) + <p>Documento:</p> (17) + newline (1) + <p>Some text 1</p> (19) + newline (1) + <p>Some text 2</p> (19) + newline (1) = 93.
// So the second "<p>Documento:</p>" starts at index 94.
if (matchedBlock && matchedBlock.start > 50) {
  console.log('Proximity test PASSED! ✅');
} else {
  console.log('Proximity test FAILED! ❌');
}


console.log('\n--- TEST 6: removeFollowerSpacer with leading <br> inside next element ---');
const htmlWithLeadingBr = `<p>Enlace para la descarga del Infostat: www.infostat.com.ar.</p>\n<h4 class="mb-4"><br>Condiciones Particulares de Entrega</h4>`;
console.log('Original HTML:\n', htmlWithLeadingBr);

const patchSpacer = removeFollowerSpacer(htmlWithLeadingBr, 'Enlace para la descarga del Infostat: www.infostat.com.ar.', 'p', 0);
console.log('Resulting patch:', patchSpacer);
const patchedResult = patchSpacer ? htmlWithLeadingBr.replace(patchSpacer.original, patchSpacer.replacement) : '';
if (patchSpacer && patchedResult.includes('<h4 class="mb-4">Condiciones Particulares de Entrega</h4>')) {
  console.log('Leading BR spacer removal test PASSED! ✅');
} else {
  console.log('Leading BR spacer removal test FAILED! ❌');
}
