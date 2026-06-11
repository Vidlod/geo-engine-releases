#!/usr/bin/env node

/**
 * download-pandoc.js
 *
 * Descarga el binario de Pandoc para empaquetarlo con la aplicación Electron.
 *
 * Uso:
 *   node scripts/download-pandoc.js            # detecta la plataforma actual
 *   node scripts/download-pandoc.js --platform darwin
 *   node scripts/download-pandoc.js --platform win32
 *   node scripts/download-pandoc.js --platform linux
 *
 * El binario se descarga a:
 *   desktop/pandoc-bin/<platform>/pandoc[.exe]
 *
 * Notas:
 *   - Solo descarga el ejecutable `pandoc`, no la distribución completa.
 *   - En macOS y Linux, el binario se marca como ejecutable (chmod +x).
 *   - Las URLs apuntan a los releases oficiales de GitHub de jgm/pandoc.
 */

const PANDOC_VERSION = '3.6.4';

// ────────────────────────────────────────────────────────────────
// URLs de descarga por plataforma (GitHub Releases)
// ────────────────────────────────────────────────────────────────

const DOWNLOAD_URLS = {
  darwin: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-macOS.zip`,
  win32:  `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
  linux:  `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
};

// Nombre del binario de salida
const BINARY_NAMES = {
  darwin: 'pandoc',
  win32:  'pandoc.exe',
  linux:  'pandoc',
};

// ────────────────────────────────────────────────────────────────
// Imports
// ────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// ────────────────────────────────────────────────────────────────
// Configuración
// ────────────────────────────────────────────────────────────────

/** Detecta la plataforma desde los argumentos CLI o del sistema. */
function getPlatform() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--platform');
  if (idx !== -1 && args[idx + 1]) {
    const plat = args[idx + 1];
    if (!DOWNLOAD_URLS[plat]) {
      console.error(`❌ Plataforma no soportada: ${plat}`);
      console.error(`   Plataformas válidas: ${Object.keys(DOWNLOAD_URLS).join(', ')}`);
      process.exit(1);
    }
    return plat;
  }
  return os.platform();
}

/** Directorio de destino: desktop/pandoc-bin/<platform>/ */
function getOutputDir(platform) {
  return path.join(__dirname, '..', 'pandoc-bin', platform);
}

// ────────────────────────────────────────────────────────────────
// Flujo principal
// ────────────────────────────────────────────────────────────────

/*
 * TODO: Implementar el flujo completo de descarga y extracción.
 *
 * El flujo planificado es el siguiente:
 *
 * 1. DETERMINAR PLATAFORMA
 *    - Leer --platform de los argumentos o usar os.platform()
 *    - Validar que sea darwin, win32 o linux
 *
 * 2. VERIFICAR SI YA EXISTE
 *    - Comprobar si pandoc-bin/<platform>/pandoc[.exe] ya existe
 *    - Si existe, mostrar mensaje y salir (a menos que se pase --force)
 *
 * 3. CREAR DIRECTORIO DE DESTINO
 *    - fs.mkdirSync(outputDir, { recursive: true })
 *
 * 4. DESCARGAR EL ARCHIVO
 *    - Opción A: usar el módulo `https` nativo de Node.js
 *      - Seguir redirects (GitHub devuelve 302)
 *      - Mostrar progreso en consola (bytes descargados)
 *    - Opción B: usar `child_process.execSync` con `curl`
 *      - curl -L -o <tempFile> <url>
 *      - Más simple y confiable para redirects
 *
 *    const tempFile = path.join(os.tmpdir(), `pandoc-${PANDOC_VERSION}.${ext}`);
 *
 * 5. EXTRAER EL BINARIO
 *    - Para .zip (macOS y Windows):
 *      - Usar `child_process.execSync` con `unzip` (macOS/Linux)
 *      - O usar el módulo `adm-zip` si se quiere Node.js puro
 *      - Extraer solo el archivo del binario (BINARY_PATHS[platform])
 *    - Para .tar.gz (Linux):
 *      - tar -xzf <tempFile> -C <tempDir> <BINARY_PATHS.linux>
 *
 * 6. MOVER EL BINARIO AL DESTINO
 *    - fs.renameSync(extractedPath, path.join(outputDir, BINARY_NAMES[platform]))
 *
 * 7. HACER EJECUTABLE (macOS y Linux)
 *    - fs.chmodSync(binaryPath, 0o755)
 *
 * 8. LIMPIAR ARCHIVOS TEMPORALES
 *    - fs.unlinkSync(tempFile)
 *    - Eliminar directorio temporal de extracción
 *
 * 9. VERIFICAR
 *    - Ejecutar `pandoc --version` y mostrar la salida
 *    - Confirmar que el binario funciona correctamente
 *
 * Ejemplo de implementación con curl (la más simple):
 *
 *   const { execSync } = require('child_process');
 *   const url = DOWNLOAD_URLS[platform];
 *   const tmpFile = path.join(os.tmpdir(), `pandoc-download.${platform === 'linux' ? 'tar.gz' : 'zip'}`);
 *
 *   console.log(`📥 Descargando Pandoc ${PANDOC_VERSION} para ${platform}...`);
 *   console.log(`   URL: ${url}`);
 *   execSync(`curl -L -o "${tmpFile}" "${url}"`, { stdio: 'inherit' });
 *
 *   console.log('📦 Extrayendo binario...');
 *   const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pandoc-'));
 *   if (platform === 'linux') {
 *     execSync(`tar -xzf "${tmpFile}" -C "${tmpDir}" "${BINARY_PATHS[platform]}"`, { stdio: 'inherit' });
 *   } else {
 *     execSync(`unzip -o "${tmpFile}" "${BINARY_PATHS[platform]}" -d "${tmpDir}"`, { stdio: 'inherit' });
 *   }
 *
 *   const extractedBinary = path.join(tmpDir, BINARY_PATHS[platform]);
 *   const destBinary = path.join(outputDir, BINARY_NAMES[platform]);
 *   fs.mkdirSync(outputDir, { recursive: true });
 *   fs.copyFileSync(extractedBinary, destBinary);
 *
 *   if (platform !== 'win32') {
 *     fs.chmodSync(destBinary, 0o755);
 *   }
 *
 *   // Limpiar
 *   fs.unlinkSync(tmpFile);
 *   fs.rmSync(tmpDir, { recursive: true, force: true });
 *
 *   console.log(`✅ Pandoc ${PANDOC_VERSION} instalado en: ${destBinary}`);
 */

/**
 * Busca de forma recursiva un archivo en un directorio.
 * @param {string} dir - Directorio a buscar.
 * @param {string} name - Nombre del archivo a buscar.
 * @returns {string|null} Ruta absoluta al archivo o null.
 */
function findBinary(dir, name) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findBinary(fullPath, name);
      if (found) return found;
    } else if (file === name) {
      return fullPath;
    }
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const platform = getPlatform();
  const outputDir = getOutputDir(platform);
  const url = DOWNLOAD_URLS[platform];
  const binaryName = BINARY_NAMES[platform];
  const destBinary = path.join(outputDir, binaryName);

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       📥 GEO Engine — Pandoc Downloader         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Versión:     ${PANDOC_VERSION}`);
  console.log(`  Plataforma:  ${platform}`);
  console.log(`  URL:         ${url}`);
  console.log(`  Destino:     ${destBinary}`);
  console.log();

  // Verificar si ya existe
  if (fs.existsSync(destBinary) && !force) {
    console.log(`✅ Pandoc ya está descargado en: ${destBinary}`);
    console.log('   Usa --force para volver a descargar.');
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `pandoc-download-${platform}-${PANDOC_VERSION}.${platform === 'linux' ? 'tar.gz' : 'zip'}`);
  
  try {
    // 1. Descargar usando curl
    console.log(`📥 Descargando Pandoc ${PANDOC_VERSION}...`);
    execSync(`curl -L -f -o "${tmpFile}" "${url}"`, { stdio: 'inherit' });
    
    // 2. Crear directorio temporal
    console.log('📦 Extrayendo binario...');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pandoc-extract-'));
    
    // 3. Extraer
    if (platform === 'linux') {
      execSync(`tar -xzf "${tmpFile}" -C "${tmpDir}"`, { stdio: 'inherit' });
    } else if (platform === 'darwin') {
      execSync(`unzip -o -q "${tmpFile}" -d "${tmpDir}"`, { stdio: 'inherit' });
    } else if (platform === 'win32') {
      // Usar tar para extraer zip en Windows
      execSync(`tar -xf "${tmpFile}" -C "${tmpDir}"`, { stdio: 'inherit' });
    }
    
    // 4. Copiar al destino
    const extractedBinary = findBinary(tmpDir, binaryName);
    if (!extractedBinary) {
      throw new Error(`No se encontró el binario extraído "${binaryName}" en el directorio temporal: ${tmpDir}`);
    }
    
    fs.mkdirSync(outputDir, { recursive: true });
    fs.copyFileSync(extractedBinary, destBinary);
    
    // 5. Dar permisos en macOS y Linux
    if (platform !== 'win32') {
      fs.chmodSync(destBinary, 0o755);
    }
    
    // 6. Limpieza
    fs.unlinkSync(tmpFile);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    
    console.log(`\n✅ Pandoc ${PANDOC_VERSION} instalado con éxito en:\n   ${destBinary}\n`);
    
    // Ejecutar verificación
    console.log('🔍 Verificando versión de Pandoc...');
    const verification = execSync(`"${destBinary}" --version`, { encoding: 'utf-8' });
    console.log(verification.split('\n')[0]);
    
  } catch (error) {
    console.error('\n❌ Error durante la descarga o extracción:');
    console.error(error.message);
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
    process.exit(1);
  }
}

main();
