/**
 * @fileoverview Cliente del endpoint de conversión (/api/convert).
 *
 * En desarrollo, Vite hace proxy hacia el server.py local (puerto 5001).
 * En producción, Flask sirve la web y el API en el mismo origen.
 *
 * @module wizard/convertApi
 */

/**
 * @typedef {Object} ConvertResult
 * @property {string} filename
 * @property {'pandoc'|'pymupdf4llm'|'mammoth'} engine
 * @property {'markdown'|'html'} format
 * @property {string} content
 * @property {string[]} warnings
 */

/** Etiquetas legibles por motor. */
export const ENGINE_LABELS = {
  pandoc:      'Pandoc → Markdown',
  pymupdf4llm: 'PyMuPDF4LLM → Markdown',
  mammoth:     'mammoth → HTML',
};

/**
 * Convierte un documento .docx o .pdf en el backend.
 *
 * @param {File} file
 * @param {'auto'|'pandoc'|'mammoth'} [engine='auto']
 * @returns {Promise<ConvertResult>}
 */
export async function convertFile(file, engine = 'auto') {
  const form = new FormData();
  form.append('file', file);
  form.append('engine', engine);

  let res;
  try {
    res = await fetch('/api/convert', { method: 'POST', body: form });
  } catch {
    throw new Error(
      'No se pudo conectar con el servidor de conversión. ' +
      'Inicia el backend con: python3 server.py'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status} al convertir`);
  }
  return /** @type {ConvertResult} */ (data);
}
