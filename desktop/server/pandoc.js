/**
 * GEO Engine — Utilidades para localizar y verificar el binario de Pandoc.
 *
 * En desarrollo se usa el pandoc del PATH del sistema.
 * En producción se usa el binario empaquetado dentro de resourcesPath.
 *
 * @module server/pandoc
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Verifica si el comando 'pandoc' está disponible en el PATH del sistema.
 * @returns {boolean}
 */
function isPandocInPath() {
  try {
    execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Devuelve la ruta al binario de Pandoc.
 *
 * @param {string}  resourcesPath - Ruta a los recursos empaquetados.
 * @param {boolean} isDev         - `true` si se ejecuta en modo desarrollo.
 * @returns {string} Ruta absoluta al binario o simplemente 'pandoc' (PATH).
 */
function getPandocPath(resourcesPath, isDev) {
  if (isDev) {
    if (isPandocInPath()) {
      return 'pandoc';
    }
    // Fallback al binario descargado localmente en desarrollo
    const binario = process.platform === 'win32' ? 'pandoc.exe' : 'pandoc';
    return path.join(__dirname, '..', 'pandoc-bin', process.platform, binario);
  }

  const binario = process.platform === 'win32' ? 'pandoc.exe' : 'pandoc';
  return path.join(resourcesPath, 'pandoc', binario);
}

/**
 * Verifica si Pandoc está disponible y devuelve información.
 *
 * @param {string}  resourcesPath - Ruta a los recursos empaquetados.
 * @param {boolean} isDev         - `true` si se ejecuta en modo desarrollo.
 * @returns {{ available: boolean, version?: string, path?: string, error?: string }}
 */
function checkPandoc(resourcesPath, isDev) {
  const pandocPath = getPandocPath(resourcesPath, isDev);

  try {
    const salida = execFileSync(pandocPath, ['--version'], {
      timeout: 5000,
      encoding: 'utf-8',
    });

    // La primera línea tiene el formato: "pandoc 3.1.9" o "pandoc.exe 3.1.9"
    const primeraLinea = salida.split('\n')[0] || '';
    const coincidencia = primeraLinea.match(/pandoc(?:\.exe)?\s+(\S+)/i);
    const version = coincidencia ? coincidencia[1] : primeraLinea.trim();

    return {
      available: true,
      version,
      path: pandocPath,
    };
  } catch (err) {
    return {
      available: false,
      error: err.code === 'ENOENT'
        ? `No se encontró el binario de Pandoc en: ${pandocPath}`
        : `Error al verificar Pandoc: ${err.message}`,
    };
  }
}

module.exports = { getPandocPath, checkPandoc };
