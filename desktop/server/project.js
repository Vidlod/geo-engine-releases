/**
 * GEO Engine — Proyecto de curso (.geocurso).
 *
 * Módulo puro de Node (sin dependencias de Electron) que gestiona la carpeta
 * de proyecto propia de la app:
 *
 *   MiCurso.geocurso/
 *   ├── curso.yaml      ← generado para el agente (fuente: .geo/curso.json)
 *   ├── insumos/        ← AAA, syllabus, rúbricas, anexos, RED
 *   ├── generadas/      ← HTML por estructura (momento-1.html, …)
 *   └── .geo/           ← estado interno de la app
 *
 * También importa cursos existentes con el formato PLANTILLA_CURSO
 * (1_insumos_origen → insumos/, 3_paginas_finales → generadas/).
 *
 * @module server/project
 */

'use strict';

const path = require('path');
const fs = require('fs');

/** Extensión de la carpeta de proyecto. */
const PROJECT_EXT = '.geocurso';

/** Configuración por defecto de un curso nuevo. */
const DEFAULT_CONFIG = {
  curso: '',
  momentos: 2,
  avances: 4,
  last_avance: 4,
  autor_red: '',
  ids: {},
};

/* ── Utilidades internas ──────────────────────────────────────────── */

/** @param {string} p */
function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

/**
 * Lista los archivos (no ocultos) de un directorio, recursivo de un nivel.
 * @param {string} dir
 * @returns {string[]} nombres de archivo (sin ruta)
 */
function listFiles(dir) {
  if (!exists(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile()) out.push(entry.name);
    else if (entry.isDirectory()) {
      for (const sub of fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })) {
        if (sub.isFile() && !sub.name.startsWith('.')) out.push(sub.name);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Valida que `target` esté dentro de `root` (evita escapes con ../).
 * @param {string} root
 * @param {string} target
 */
function insideProject(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Serializa la config a YAML simple (esquema plano + dos mapas).
 * Suficiente para que el agente lo lea; el almacén canónico es curso.json.
 * @param {object} config
 * @param {Record<string,string>} fileMap
 * @returns {string}
 */
function toYaml(config, fileMap) {
  /** @param {string} s */
  const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const lines = [
    '# curso.yaml — generado por GEO Engine. Editar desde la app.',
    `curso: ${q(config.curso)}`,
    `momentos: ${Number(config.momentos) || 0}`,
    `avances: ${Number(config.avances) || 0}`,
    `last_avance: ${Number(config.last_avance) || 0}`,
    `autor_red: ${q(config.autor_red || '')}`,
    'ids:',
  ];
  const ids = config.ids || {};
  for (const key of Object.keys(ids)) {
    lines.push(`  ${key}: ${q(ids[key])}`);
  }
  if (!Object.keys(ids).length) lines[lines.length - 1] = 'ids: {}';

  lines.push('files:');
  const names = Object.keys(fileMap);
  for (const term of names) {
    lines.push(`  ${q(term)}: ${q(fileMap[term])}`);
  }
  if (!names.length) lines[lines.length - 1] = 'files: {}';
  return lines.join('\n') + '\n';
}

/**
 * Mapa de archivos automático: término legible → nombre exacto.
 * El término se deriva del nombre del archivo (sin extensión, sin guiones).
 * @param {string[]} insumos
 * @returns {Record<string,string>}
 */
function buildFileMap(insumos) {
  /** @type {Record<string,string>} */
  const map = {};
  for (const name of insumos) {
    const base = name.replace(/\.[^.]+$/, '');
    const term = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (term) map[term] = name;
  }
  return map;
}

/* ── FLAGS y CORRECCIONES ─────────────────────────────────────────── */

/**
 * Extrae los comentarios FLAG de un HTML generado.
 * @param {string} html
 * @returns {{ type: string, message: string }[]}
 */
function parseFlags(html) {
  /** @type {{ type: string, message: string }[]} */
  const flags = [];
  const re = /<!--\s*FLAG:\s*\[?([a-z-]+)\]?\s*([\s\S]*?)-->/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    flags.push({ type: m[1].trim(), message: m[2].trim() });
  }
  return flags;
}

/**
 * Extrae la lista CORRECCIONES: (si la skill la dejó como comentario o texto).
 * @param {string} html
 * @returns {string[]}
 */
function parseCorrections(html) {
  const m = /CORRECCIONES:\s*([\s\S]*?)(?:-->|$)/i.exec(html);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^[\s*•-]+/, '').trim())
    .filter((l) => l.length > 3);
}

/* ── Estructuras del curso ────────────────────────────────────────── */

/**
 * Detecta si hay una AAA entre los insumos (requisito mínimo para generar).
 * @param {string[]} insumos
 */
function hasAAA(insumos) {
  return insumos.some((n) => /(^|[^a-z])aaa([^a-z]|$)/i.test(n) || /^AAA/i.test(n));
}

/**
 * Calcula la lista de estructuras del curso con su estado.
 * Estados: 'sin-insumos' | 'lista' | 'flags' | 'ok'
 * @param {object} config
 * @param {string[]} insumos
 * @param {string} generadasDir
 * @returns {object[]}
 */
function computeStructures(config, insumos, generadasDir) {
  /** @type {{id:string,label:string,skill:string,file:string,numero?:number}[]} */
  const defs = [
    { id: 'introduccion', label: 'Introducción al curso', skill: 'geo-introduccion', file: 'introduccion.html' },
  ];
  const momentos = Math.max(1, Number(config.momentos) || 1);
  for (let n = 1; n <= momentos; n++) {
    defs.push({ id: `momento-${n}`, label: `Momento Evaluativo ${n}`, skill: 'geo-momento', file: `momento-${n}.html`, numero: n });
  }
  const avances = Math.max(0, Number(config.avances) || 0);
  for (let n = 1; n <= avances; n++) {
    const esFinal = n === Number(config.last_avance);
    defs.push({
      id: `entregable-${n}`,
      label: esFinal ? `Entregable ${n} (Producto Final)` : `Entregable ${n}`,
      skill: 'geo-entregable',
      file: `entregable-${n}.html`,
      numero: n,
    });
  }
  defs.push({ id: 'glosario', label: 'Glosario', skill: 'geo-glosario', file: 'glosario.html' });
  defs.push({ id: 'linea-tiempo', label: 'Línea de tiempo', skill: 'geo-linea-tiempo', file: 'linea-tiempo.html' });

  const aaa = hasAAA(insumos);
  return defs.map((d) => {
    const filePath = path.join(generadasDir, d.file);
    let status = aaa ? 'lista' : 'sin-insumos';
    /** @type {{type:string,message:string}[]} */
    let flags = [];
    /** @type {string[]} */
    let corrections = [];
    if (exists(filePath)) {
      const html = fs.readFileSync(filePath, 'utf-8');
      flags = parseFlags(html);
      corrections = parseCorrections(html);
      status = flags.length ? 'flags' : 'ok';
    }
    return { ...d, status, flags, corrections };
  });
}

/* ── API pública ──────────────────────────────────────────────────── */

/**
 * Crea un proyecto de curso nuevo.
 * @param {string} parentDir - Carpeta donde crearlo.
 * @param {string} name - Nombre del curso.
 * @returns {{ path: string }}
 */
function createProject(parentDir, name) {
  const safe = String(name).trim().replace(/[\\/:*?"<>|]/g, '_');
  if (!safe) throw new Error('El nombre del curso no puede estar vacío.');
  const projectPath = path.join(parentDir, safe + PROJECT_EXT);
  if (exists(projectPath)) throw new Error(`Ya existe un proyecto en ${projectPath}`);

  fs.mkdirSync(path.join(projectPath, 'insumos'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'generadas'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, '.geo'), { recursive: true });

  const config = { ...DEFAULT_CONFIG, curso: String(name).trim() };
  fs.writeFileSync(path.join(projectPath, '.geo', 'curso.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(projectPath, 'curso.yaml'), toYaml(config, {}));
  return { path: projectPath };
}

/**
 * Abre un proyecto y devuelve su estado completo.
 * @param {string} projectPath
 */
function openProject(projectPath) {
  const configPath = path.join(projectPath, '.geo', 'curso.json');
  if (!exists(configPath)) {
    throw new Error('La carpeta seleccionada no es un proyecto de curso de GEO Engine.');
  }
  const config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
  const insumos = listFiles(path.join(projectPath, 'insumos'));
  const generadas = listFiles(path.join(projectPath, 'generadas'));
  const fileMap = buildFileMap(insumos);

  // Regenerar curso.yaml en cada apertura (mapa de archivos al día)
  fs.writeFileSync(path.join(projectPath, 'curso.yaml'), toYaml(config, fileMap));

  return {
    path: projectPath,
    name: config.curso || path.basename(projectPath, PROJECT_EXT),
    config,
    insumos,
    generadas,
    fileMap,
    structures: computeStructures(config, insumos, path.join(projectPath, 'generadas')),
  };
}

/**
 * Guarda la configuración del curso y regenera curso.yaml.
 * @param {string} projectPath
 * @param {object} config
 */
function saveConfig(projectPath, config) {
  const configPath = path.join(projectPath, '.geo', 'curso.json');
  if (!exists(configPath)) throw new Error('Proyecto no válido.');
  const current = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const merged = { ...DEFAULT_CONFIG, ...current, ...config };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  const insumos = listFiles(path.join(projectPath, 'insumos'));
  fs.writeFileSync(path.join(projectPath, 'curso.yaml'), toYaml(merged, buildFileMap(insumos)));
  return openProject(projectPath);
}

/**
 * Importa una carpeta con el formato PLANTILLA_CURSO a un proyecto nuevo.
 * 1_insumos_origen/** → insumos/   ·   3_paginas_finales/**.html → generadas/
 * @param {string} plantillaDir
 * @param {string} parentDir
 * @param {string} name
 */
function importPlantilla(plantillaDir, parentDir, name) {
  const insumosSrc = path.join(plantillaDir, '1_insumos_origen');
  const finalesSrc = path.join(plantillaDir, '3_paginas_finales');
  if (!exists(insumosSrc) && !exists(finalesSrc)) {
    throw new Error('La carpeta no tiene el formato PLANTILLA_CURSO (faltan 1_insumos_origen y 3_paginas_finales).');
  }

  const { path: projectPath } = createProject(parentDir, name);

  /** Copia recursiva aplanando subcarpetas. @param {string} src @param {string} dst @param {(n:string)=>boolean} filter */
  const flatCopy = (src, dst, filter) => {
    if (!exists(src)) return;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(src, entry.name);
      if (entry.isDirectory()) flatCopy(full, dst, filter);
      else if (filter(entry.name)) fs.copyFileSync(full, path.join(dst, entry.name));
    }
  };

  flatCopy(insumosSrc, path.join(projectPath, 'insumos'), (n) => !/_extracted\.(txt|html)$/i.test(n));

  // Páginas finales: renombrar a la convención de la app cuando sea reconocible
  const generadasDst = path.join(projectPath, 'generadas');
  const renames = [
    [/momento\s*evaluativo\s*(\d+)/i, (m) => `momento-${m[1]}.html`],
    // tolera typos reales como "Entregalbe"
    [/entrega[a-z]*\b.*?(\d+)/i, (m) => `entregable-${m[1]}.html`],
    [/producto\s*fina/i, () => null],            // se resuelve con el nº entre paréntesis
    [/introducci[oó]n/i, () => 'introduccion.html'],
    [/glosari/i, () => 'glosario.html'],
    [/l[ií]nea\s*del?\s*tiempo|lineadeltiempo/i, () => 'linea-tiempo.html'],
  ];
  /** @param {string} name */
  const targetName = (name) => {
    const final = /\(.*?(\d+)\s*\)/.exec(name);
    if (/producto\s*fina/i.test(name) && final) return `entregable-${final[1]}.html`;
    for (const [re, fn] of renames) {
      const m = re.exec(name);
      if (m) {
        const t = /** @type {(m:RegExpExecArray)=>string|null} */ (fn)(m);
        if (t) return t;
      }
    }
    return name;
  };
  const copyHtml = (src) => {
    if (!exists(src)) return;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(src, entry.name);
      if (entry.isDirectory()) copyHtml(full);
      else if (/\.html?$/i.test(entry.name)) {
        fs.copyFileSync(full, path.join(generadasDst, targetName(entry.name)));
      }
    }
  };
  copyHtml(finalesSrc);

  return openProject(projectPath);
}

/**
 * Lee un HTML generado del proyecto (validando que esté dentro de generadas/).
 * @param {string} projectPath
 * @param {string} fileName
 * @returns {{ name: string, html: string }}
 */
function readGenerated(projectPath, fileName) {
  const filePath = path.join(projectPath, 'generadas', fileName);
  if (!insideProject(path.join(projectPath, 'generadas'), filePath)) {
    throw new Error('Ruta fuera del proyecto.');
  }
  return { name: fileName, html: fs.readFileSync(filePath, 'utf-8') };
}

/**
 * Copia archivos de insumo al proyecto.
 * @param {string} projectPath
 * @param {string[]} filePaths - Rutas absolutas de los archivos a copiar.
 */
function addInsumos(projectPath, filePaths) {
  const dst = path.join(projectPath, 'insumos');
  if (!exists(dst)) throw new Error('Proyecto no válido.');
  for (const fp of filePaths) {
    fs.copyFileSync(fp, path.join(dst, path.basename(fp)));
  }
  return openProject(projectPath);
}

module.exports = {
  PROJECT_EXT,
  createProject,
  openProject,
  saveConfig,
  importPlantilla,
  readGenerated,
  addInsumos,
  // expuestos para tests
  buildFileMap,
  parseFlags,
  parseCorrections,
  computeStructures,
  toYaml,
};
