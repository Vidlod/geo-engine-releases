/**
 * Tests del proyecto de curso (.geocurso) y del driver del agente.
 *
 * Uso:  node scripts/project.test.mjs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const project = require('../server/project.js');
const agent = require('../server/agent.js');

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`);
  if (!cond) failures++;
};

const tmp = mkdtempSync(path.join(tmpdir(), 'geocurso-'));

/* ── createProject / openProject ──────────────────────────── */
console.log('— Proyecto: crear y abrir —');
{
  const { path: projectPath } = project.createProject(tmp, 'Criminología');
  check('carpeta .geocurso creada', projectPath.endsWith('.geocurso') && existsSync(projectPath));
  check('insumos/ y generadas/ existen',
    existsSync(path.join(projectPath, 'insumos')) && existsSync(path.join(projectPath, 'generadas')));
  check('curso.yaml generado', existsSync(path.join(projectPath, 'curso.yaml')));

  const p = project.openProject(projectPath);
  check('open devuelve nombre y config', p.name === 'Criminología' && p.config.momentos === 2);
  check('sin AAA: estructuras en sin-insumos',
    p.structures.every((s) => s.status === 'sin-insumos'));
  check('estructuras esperadas (intro + 2 momentos + 4 entregables + glosario + línea)',
    p.structures.length === 1 + 2 + 4 + 2);

  // AAA presente → 'lista'
  writeFileSync(path.join(projectPath, 'insumos', 'AAA-pregrado.docx'), 'x');
  writeFileSync(path.join(projectPath, 'insumos', 'Rubrica1_Curso.pdf'), 'x');
  const p2 = project.openProject(projectPath);
  check('con AAA: estructuras listas', p2.structures.every((s) => s.status === 'lista'));
  check('mapa de archivos con nombres exactos',
    p2.fileMap['rubrica1 curso'] === 'Rubrica1_Curso.pdf');
  const yaml = readFileSync(path.join(projectPath, 'curso.yaml'), 'utf-8');
  check('curso.yaml contiene el mapa', yaml.includes('"Rubrica1_Curso.pdf"'));

  // Generada con FLAG → 'flags'; sin FLAG → 'ok'
  writeFileSync(path.join(projectPath, 'generadas', 'momento-1.html'),
    '<!-- FLAG: dato-faltante Falta el enlace del foro -->\n<!-- CORRECCIONES:\n- Comprar → Comparar (semana 3)\n-->\n<p>hola</p>');
  writeFileSync(path.join(projectPath, 'generadas', 'momento-2.html'), '<p>limpio</p>');
  const p3 = project.openProject(projectPath);
  const m1 = p3.structures.find((s) => s.id === 'momento-1');
  const m2 = p3.structures.find((s) => s.id === 'momento-2');
  check('momento-1 con FLAGS', m1.status === 'flags' && m1.flags[0].type === 'dato-faltante');
  check('momento-1 con correcciones parseadas',
    m1.corrections.some((c) => c.includes('Comprar')));
  check('momento-2 generada limpia', m2.status === 'ok' && m2.flags.length === 0);

  // saveConfig
  const p4 = project.saveConfig(projectPath, { momentos: 1, avances: 2, last_avance: 2 });
  check('saveConfig recalcula estructuras', p4.structures.filter((s) => s.id.startsWith('momento')).length === 1);
  check('Producto Final etiquetado',
    p4.structures.some((s) => s.label.includes('Producto Final') && s.id === 'entregable-2'));

  // readGenerated + validación de ruta
  const rg = project.readGenerated(projectPath, 'momento-2.html');
  check('readGenerated devuelve el HTML', rg.html === '<p>limpio</p>');
  let escaped = false;
  try { project.readGenerated(projectPath, '../curso.yaml'); } catch { escaped = true; }
  check('readGenerated bloquea rutas fuera de generadas/', escaped);
}

/* ── importPlantilla ──────────────────────────────────────── */
console.log('— Importar PLANTILLA_CURSO —');
{
  const plantilla = path.join(tmp, 'PLANTILLA_CURSO');
  mkdirSync(path.join(plantilla, '1_insumos_origen', 'documentos_word'), { recursive: true });
  mkdirSync(path.join(plantilla, '3_paginas_finales', 'Momentos'), { recursive: true });
  writeFileSync(path.join(plantilla, '1_insumos_origen', 'documentos_word', 'AAA-pregrado.docx'), 'x');
  writeFileSync(path.join(plantilla, '1_insumos_origen', 'documentos_word', 'AAA-pregrado_extracted.html'), 'x');
  writeFileSync(path.join(plantilla, '3_paginas_finales', 'Momentos', 'Momento Evaluativo1.html'), '<p>m1</p>');
  writeFileSync(path.join(plantilla, '3_paginas_finales', 'Entregalbe Avance 2.html'), '<p>e2</p>');
  writeFileSync(path.join(plantilla, '3_paginas_finales', 'Entregable Producto Fina (Entregalbe Avance 5).html'), '<p>pf</p>');
  writeFileSync(path.join(plantilla, '3_paginas_finales', 'Glosaria.html'), '<p>g</p>');
  writeFileSync(path.join(plantilla, '3_paginas_finales', 'Lineadeltiempo.html'), '<p>lt</p>');

  const p = project.importPlantilla(plantilla, tmp, 'Importado');
  check('insumos importados (sin *_extracted)',
    p.insumos.includes('AAA-pregrado.docx') && !p.insumos.some((n) => n.includes('_extracted')));
  check('Momento Evaluativo1.html → momento-1.html', p.generadas.includes('momento-1.html'));
  check('Entregalbe Avance 2 → entregable-2.html', p.generadas.includes('entregable-2.html'));
  check('Producto Final (5) → entregable-5.html', p.generadas.includes('entregable-5.html'));
  check('Glosaria → glosario.html', p.generadas.includes('glosario.html'));
  check('Lineadeltiempo → linea-tiempo.html', p.generadas.includes('linea-tiempo.html'));
}

/* ── Agente: estado, token, skills, instrucción ───────────── */
console.log('— Agente —');
{
  const userData = mkdtempSync(path.join(tmpdir(), 'geo-userdata-'));
  const fakeStorage = {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  };

  const status = agent.getStatus(userData, fakeStorage);
  check('SDK embebido disponible', status.sdkAvailable === true);
  check('estado con forma esperada', 'hasCredential' in status && 'credentialSource' in status);

  const withToken = agent.setToken(userData, fakeStorage, 'sk-ant-api03-prueba');
  check('setToken → credencial de la app', withToken.hasCredential && withToken.credentialSource === 'app');
  const cleared = agent.clearToken(userData, fakeStorage);
  check('clearToken vuelve al estado base', cleared.credentialSource !== 'app');

  // syncSkills desde el repo real
  const projDir = mkdtempSync(path.join(tmpdir(), 'geo-proj-'));
  const skillsSrc = path.resolve(new URL('.', import.meta.url).pathname, '..', '..', 'skills');
  const synced = agent.syncSkills(projDir, skillsSrc);
  check('skills sincronizadas en .claude/skills', synced.includes('geo-momento') &&
    existsSync(path.join(projDir, '.claude', 'skills', 'geo-momento', 'SKILL.md')));
  check('referencias de la skill copiadas',
    existsSync(path.join(projDir, '.claude', 'skills', 'geo-momento', 'references', 'reglas-transversales.md')));

  const instr = agent.buildInstruction({
    id: 'momento-1', skill: 'geo-momento', file: 'momento-1.html',
    label: 'Momento Evaluativo 1', numero: 1,
  });
  check('instrucción menciona skill, archivo y curso.yaml',
    instr.includes('geo-momento') && instr.includes('generadas/momento-1.html') && instr.includes('curso.yaml'));
  check('instrucción exige el mapa de archivos', instr.includes('MAPA DE ARCHIVOS'));

  check('describeTool legible',
    agent.describeTool({ name: 'Write', input: { file_path: '/x/momento-1.html' } }).includes('momento-1.html'));

  rmSync(userData, { recursive: true, force: true });
  rmSync(projDir, { recursive: true, force: true });
}

rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nPROJECT OK' : `\nPROJECT FALLÓ: ${failures} aserciones`);
process.exit(failures === 0 ? 0 : 1);
