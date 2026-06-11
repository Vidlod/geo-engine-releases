/**
 * GEO Engine — Router de conversión de documentos.
 *
 * Endpoint POST /convert que acepta archivos .docx y .pdf y los convierte
 * a Markdown o HTML usando distintos motores:
 *   - Pandoc       (.docx → Markdown GFM)       [motor por defecto]
 *   - mammoth      (.docx → HTML)                [motor alternativo]
 *   - PyMuPDF4LLM  (.pdf  → Markdown)            [vía subproceso Python]
 *
 * Formato de respuesta (compatible con la API Flask original):
 *   { filename, engine, format, content, warnings }
 *
 * @module server/convert
 */

'use strict';

const path          = require('path');
const fs            = require('fs');
const os            = require('os');
const { execFile, spawn } = require('child_process');
const multer        = require('multer');
const { getPandocPath }   = require('./pandoc');

/** Extensiones de archivo permitidas */
const EXTENSIONES_PERMITIDAS = new Set(['.docx', '.pdf']);

/** 50 MB en bytes — límite para maxBuffer de Pandoc */
const MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Configuración de multer: almacena en carpeta temporal del sistema
 * con nombre único para evitar colisiones.
 */
const upload = multer({
  dest: path.join(os.tmpdir(), 'geo-engine-uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

/**
 * Elimina un archivo temporal de forma segura (sin lanzar error si no existe).
 *
 * @param {string} rutaArchivo - Ruta al archivo temporal.
 */
function limpiarTemporal(rutaArchivo) {
  try {
    if (rutaArchivo && fs.existsSync(rutaArchivo)) {
      fs.unlinkSync(rutaArchivo);
    }
  } catch (_) {
    // Ignorar errores de limpieza
  }
}

// ─────────────────────────────────────────────────────────────────
// Motores de conversión
// ─────────────────────────────────────────────────────────────────

/**
 * Convierte un .docx a Markdown GFM usando el binario de Pandoc.
 *
 * @param {string} rutaArchivo   - Ruta al archivo .docx temporal.
 * @param {string} resourcesPath - Ruta a los recursos empaquetados.
 * @param {boolean} isDev        - Modo desarrollo.
 * @returns {Promise<string>} Contenido Markdown.
 */
function convertirConPandoc(rutaArchivo, resourcesPath, isDev) {
  return new Promise((resolve, reject) => {
    const pandoc = getPandocPath(resourcesPath, isDev);
    const args   = [rutaArchivo, '-f', 'docx', '-t', 'gfm', '--wrap=none'];

    execFile(pandoc, args, { maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return reject(new ConversionError(
            `No se encontró el binario de Pandoc en "${pandoc}". ` +
            'Asegúrate de que Pandoc esté instalado y disponible en el PATH.',
            503
          ));
        }
        return reject(new ConversionError(
          `Error de Pandoc: ${stderr || err.message}`,
          500
        ));
      }
      resolve(stdout);
    });
  });
}

/**
 * Convierte un .pdf a Markdown usando PyMuPDF4LLM vía subproceso Python.
 *
 * @param {string}  rutaArchivo   - Ruta al archivo .pdf temporal.
 * @param {string}  resourcesPath - Ruta a los recursos empaquetados.
 * @param {boolean} isDev         - Modo desarrollo.
 * @returns {Promise<string>} Contenido Markdown.
 */
function convertirConPyMuPDF(rutaArchivo, resourcesPath, isDev) {
  // Determinar ruta al script de Python
  const scriptPath = isDev
    ? path.join(__dirname, 'convert_pdf.py')
    : path.join(resourcesPath, 'scripts', 'convert_pdf.py');

  // Candidatos de intérprete Python, en orden de preferencia
  const candidatos = ['python3', 'python', 'py'];

  return intentarPython(candidatos, 0, scriptPath, rutaArchivo);
}

/**
 * Intenta ejecutar el script Python con distintos intérpretes de forma
 * recursiva hasta que uno funcione o se agoten los candidatos.
 *
 * @param {string[]} candidatos  - Lista de nombres de intérprete Python.
 * @param {number}   indice      - Índice actual dentro de candidatos.
 * @param {string}   scriptPath  - Ruta al script convert_pdf.py.
 * @param {string}   rutaArchivo - Ruta al PDF temporal.
 * @returns {Promise<string>}
 */
function intentarPython(candidatos, indice, scriptPath, rutaArchivo) {
  if (indice >= candidatos.length) {
    return Promise.reject(new ConversionError(
      'No se encontró Python en el sistema. ' +
      'Instala Python 3 desde https://www.python.org/ y asegúrate de que esté en el PATH.',
      503
    ));
  }

  const interprete = candidatos[indice];

  return new Promise((resolve, reject) => {
    const proc = spawn(interprete, [scriptPath, rutaArchivo]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        // Este intérprete no existe, probar el siguiente
        intentarPython(candidatos, indice + 1, scriptPath, rutaArchivo)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new ConversionError(
          `Error al ejecutar Python (${interprete}): ${err.message}`,
          500
        ));
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        // Detectar si falta pymupdf4llm
        if (stderr.includes('pymupdf4llm')) {
          return reject(new ConversionError(
            'Falta la dependencia pymupdf4llm. Instálala con: pip3 install pymupdf4llm',
            503
          ));
        }
        return reject(new ConversionError(
          `Error al convertir PDF: ${stderr || 'proceso terminó con código ' + code}`,
          500
        ));
      }
      resolve(stdout);
    });
  });
}

/**
 * Convierte un .docx a HTML usando la biblioteca mammoth.
 *
 * @param {Buffer} buffer - Contenido del archivo .docx en memoria.
 * @returns {Promise<{ html: string, warnings: string[] }>}
 */
async function convertirConMammoth(buffer) {
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch (_) {
    throw new ConversionError(
      'Falta la dependencia mammoth. Instálala con: npm install mammoth',
      503
    );
  }

  const resultado = await mammoth.convertToHtml({ buffer });
  return {
    html:     resultado.value,
    warnings: resultado.messages.map((m) => m.message),
  };
}

// ─────────────────────────────────────────────────────────────────
// Error personalizado con código HTTP
// ─────────────────────────────────────────────────────────────────

/**
 * Error de conversión que incluye un código de estado HTTP.
 */
class ConversionError extends Error {
  /**
   * @param {string} message - Mensaje descriptivo en español.
   * @param {number} statusCode - Código HTTP (400, 500, 503).
   */
  constructor(message, statusCode) {
    super(message);
    this.name       = 'ConversionError';
    this.statusCode = statusCode;
  }
}

// ─────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────

/**
 * Crea y devuelve un Router de Express con el endpoint POST /convert.
 *
 * @param {object}  opciones
 * @param {string}  opciones.resourcesPath - Ruta a recursos empaquetados.
 * @param {boolean} opciones.isDev         - Modo desarrollo.
 * @returns {import('express').Router}
 */
function convertRouter({ resourcesPath, isDev }) {
  const router = require('express').Router();

  router.post('/convert', upload.single('file'), async (req, res) => {
    /** @type {string|undefined} */
    let rutaTemporal;

    try {
      // ── Validar archivo subido ────────────────────────────────
      if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo.' });
      }

      rutaTemporal = req.file.path;
      const nombreArchivo = req.file.originalname || 'archivo';
      const ext = path.extname(nombreArchivo).toLowerCase();

      if (!EXTENSIONES_PERMITIDAS.has(ext)) {
        return res.status(400).json({
          error: 'Tipo de archivo no permitido. Debe ser .docx o .pdf',
        });
      }

      // ── Determinar motor ──────────────────────────────────────
      let engine = (req.body && req.body.engine) || 'auto';

      if (ext === '.pdf') {
        engine = 'pymupdf4llm';
      } else if (engine !== 'mammoth') {
        // 'auto' y 'pandoc' → usar Pandoc
        engine = 'pandoc';
      }

      // ── Ejecutar conversión ───────────────────────────────────
      if (engine === 'mammoth') {
        const buffer    = fs.readFileSync(rutaTemporal);
        const resultado = await convertirConMammoth(buffer);

        return res.json({
          filename: nombreArchivo,
          engine,
          format:   'html',
          content:  resultado.html,
          warnings: resultado.warnings,
        });
      }

      if (engine === 'pandoc') {
        const contenido = await convertirConPandoc(rutaTemporal, resourcesPath, isDev);

        return res.json({
          filename: nombreArchivo,
          engine,
          format:   'markdown',
          content:  contenido,
          warnings: [],
        });
      }

      // engine === 'pymupdf4llm'
      const contenido = await convertirConPyMuPDF(rutaTemporal, resourcesPath, isDev);

      return res.json({
        filename: nombreArchivo,
        engine,
        format:   'markdown',
        content:  contenido,
        warnings: [],
      });

    } catch (err) {
      const codigo  = err instanceof ConversionError ? err.statusCode : 500;
      const mensaje = err instanceof ConversionError
        ? err.message
        : `Fallo al procesar el archivo: ${err.message}`;

      return res.status(codigo).json({ error: mensaje });

    } finally {
      // Siempre limpiar el archivo temporal
      limpiarTemporal(rutaTemporal);
    }
  });

  return router;
}

module.exports = { convertRouter };
