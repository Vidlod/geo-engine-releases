/**
 * GEO Engine — Servidor Express embebido para Electron.
 *
 * Reemplaza al servidor Flask (server.py) con un equivalente en Node.js.
 * Expone la API de conversión en /api y sirve la web compilada como SPA.
 *
 * @module server/index
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const { convertRouter } = require('./convert');

/**
 * Inicia el servidor Express embebido.
 *
 * @param {object}  opciones
 * @param {string}  opciones.webDistPath   - Ruta absoluta a la carpeta web/dist compilada.
 * @param {string}  opciones.resourcesPath - Ruta absoluta a los recursos empaquetados (binarios, scripts).
 * @param {boolean} opciones.isDev         - Indica si se ejecuta en modo desarrollo.
 * @returns {Promise<number>} El puerto dinámico asignado por el sistema operativo.
 */
function startServer({ webDistPath, resourcesPath, isDev }) {
  return new Promise((resolve, reject) => {
    const app = express();

    // ── Middleware global ─────────────────────────────────────────
    app.use(express.json({ limit: '50mb' }));

    // ── API de conversión ─────────────────────────────────────────
    const router = convertRouter({ resourcesPath, isDev });
    app.use('/api', router);

    // ── Archivos estáticos de la web compilada ────────────────────
    app.use(express.static(webDistPath));

    // ── SPA fallback ──────────────────────────────────────────────
    // Cualquier GET que no coincida con un archivo estático ni con
    // la API devuelve index.html (comportamiento SPA).
    app.get('*', (_req, res) => {
      const indexPath = path.join(webDistPath, 'index.html');

      if (!fs.existsSync(indexPath)) {
        return res.status(200).send(
          '<h1>GEO Engine</h1>' +
          '<p>La web no está compilada. Ejecuta:</p>' +
          '<pre>cd web && npm install && npm run build</pre>'
        );
      }

      res.sendFile(indexPath);
    });

    // ── Escuchar en puerto dinámico ───────────────────────────────
    const server = app.listen(0, '127.0.0.1', () => {
      const puerto = /** @type {import('net').AddressInfo} */ (server.address()).port;
      console.log(`GEO Engine — http://127.0.0.1:${puerto}`);
      resolve(puerto);
    });

    server.on('error', (err) => {
      console.error('Error al iniciar el servidor:', err.message);
      reject(err);
    });
  });
}

module.exports = { startServer };
