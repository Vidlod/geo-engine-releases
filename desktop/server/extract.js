/**
 * GEO Engine — Extracción de texto de los insumos para el agente.
 *
 * Los agentes headless solo tienen Read/Write: no pueden abrir un .docx, .pdf
 * o .xlsx binarios. Antes de generar, este módulo convierte cada insumo a una
 * versión de texto (Markdown) en `<proyecto>/.geo/insumos-texto/`, con caché
 * por fecha de modificación. Reutiliza los mismos motores del asistente:
 *
 *   .docx → pandoc (binario embebido)        → .md
 *   .pdf  → convert_pdf.py (PyMuPDF4LLM)     → .md
 *   .xlsx → convert_xlsx.py (solo stdlib)    → .md
 *   .txt / .md / .html / .htm                → se usan tal cual
 *
 * @module server/extract
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getPandocPath } = require('./pandoc');

/** Subcarpeta del proyecto donde se cachea el texto extraído. */
const TEXT_DIR = path.join('.geo', 'insumos-texto');

/** Extensiones legibles directamente por el agente (sin conversión). */
const READABLE = new Set(['.txt', '.md', '.markdown', '.html', '.htm', '.csv', '.tsv', '.yaml', '.yml', '.json']);

/** 50 MB — límite de salida de los conversores. */
const MAX_BUFFER = 50 * 1024 * 1024;

/** @param {string} bin @param {string[]} args @returns {Promise<string>} stdout */
function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: MAX_BUFFER, timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr ? String(stderr).slice(0, 300) : err.message));
      else resolve(stdout);
    });
  });
}

/**
 * Ejecuta un script Python probando intérpretes comunes.
 * @param {string} scriptPath @param {string} filePath
 * @returns {Promise<string>}
 */
async function runPython(scriptPath, filePath) {
  let lastErr = null;
  for (const py of ['python3', 'python', 'py']) {
    try {
      return await run(py, [scriptPath, filePath]);
    } catch (err) {
      lastErr = err;
      if (!/ENOENT/.test(err.message)) break; // el intérprete existe: error real
    }
  }
  throw lastErr || new Error('No se encontró Python en el sistema.');
}

/**
 * Convierte un insumo a texto si hace falta. Devuelve la ruta (relativa al
 * proyecto) que el agente debe leer.
 *
 * @param {string} projectPath
 * @param {string} relName - nombre dentro de insumos/ (p. ej. "AAA.docx")
 * @param {{ resourcesPath: string, isDev: boolean }} ctx
 * @returns {Promise<{ original: string, text: string, converted: boolean }>}
 */
async function extractOne(projectPath, relName, ctx) {
  const src = path.join(projectPath, 'insumos', relName);
  const ext = path.extname(relName).toLowerCase();
  const original = path.posix.join('insumos', ...relName.split(/[/\\]/));

  if (READABLE.has(ext)) {
    return { original, text: original, converted: false };
  }

  const outDir = path.join(projectPath, TEXT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(relName, ext);
  const outFile = path.join(outDir, `${base}.md`);
  const textRel = path.posix.join('.geo', 'insumos-texto', `${base}.md`);

  // Caché: regenerar solo si el insumo cambió después de la última extracción
  try {
    if (fs.statSync(outFile).mtimeMs >= fs.statSync(src).mtimeMs) {
      return { original, text: textRel, converted: true };
    }
  } catch { /* sin caché */ }

  let content;
  if (ext === '.docx') {
    const pandoc = getPandocPath(ctx.resourcesPath, ctx.isDev);
    content = await run(pandoc, [src, '-f', 'docx', '-t', 'gfm', '--wrap=none']);
  } else if (ext === '.pdf') {
    const script = ctx.isDev
      ? path.join(__dirname, 'convert_pdf.py')
      : path.join(ctx.resourcesPath, 'scripts', 'convert_pdf.py');
    content = await runPython(script, src);
  } else if (ext === '.xlsx' || ext === '.xlsm') {
    const script = ctx.isDev
      ? path.join(__dirname, 'convert_xlsx.py')
      : path.join(ctx.resourcesPath, 'scripts', 'convert_xlsx.py');
    content = await runPython(script, src);
  } else {
    throw new Error(`Formato sin conversor: ${ext}`);
  }

  if (!String(content).trim()) throw new Error('La conversión devolvió un texto vacío.');
  fs.writeFileSync(outFile, content);
  return { original, text: textRel, converted: true };
}

/**
 * Convierte una lista de insumos a texto legible para el agente.
 * No lanza: los fallos por archivo se reportan en `warnings`.
 *
 * @param {string} projectPath
 * @param {string[]} relNames - nombres dentro de insumos/
 * @param {{ resourcesPath: string, isDev: boolean }} ctx
 * @param {(msg: string) => void} [onStatus]
 * @returns {Promise<{ entries: {original:string,text:string,converted:boolean}[], warnings: string[] }>}
 */
async function extractInsumos(projectPath, relNames, ctx, onStatus) {
  const entries = [];
  const warnings = [];
  for (const relName of relNames) {
    try {
      const entry = await extractOne(projectPath, relName, ctx);
      if (entry.converted && typeof onStatus === 'function') {
        onStatus(`Insumo convertido a texto: ${relName}`);
      }
      entries.push(entry);
    } catch (err) {
      warnings.push(`${relName}: ${err.message}`);
      // El agente recibe el original como último recurso
      const origPosix = path.posix.join('insumos', ...relName.split(/[/\\]/));
      entries.push({
        original: origPosix,
        text: origPosix,
        converted: false,
      });
    }
  }
  return { entries, warnings };
}

module.exports = { extractInsumos, extractOne, TEXT_DIR };
