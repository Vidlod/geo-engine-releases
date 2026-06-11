'use strict';

/**
 * @fileoverview Proceso principal de Electron para GEO Engine Desktop.
 *
 * Responsabilidades:
 *  - Bloqueo de instancia única (evita abrir la app dos veces).
 *  - Detección de modo desarrollo vs. producción.
 *  - Arranque del servidor Express embebido en un puerto dinámico.
 *  - Creación de la ventana principal con preferencias seguras.
 *  - Registro de manejadores IPC para diálogos nativos, sistema de archivos, etc.
 *  - Configuración del menú nativo de la aplicación.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const { buildMenu } = require('./menu');
const project = require('./server/project');
const agent = require('./server/agent');

// ─── Constantes ──────────────────────────────────────────────────────
/** @type {boolean} Indica si la app está corriendo en modo desarrollo */
const isDev = !app.isPackaged;

/**
 * Ruta al directorio de distribución del frontend (Vite build).
 * En desarrollo: ../web/dist relativo al directorio de este archivo.
 * En producción: web-dist dentro de los recursos empaquetados.
 */
const WEB_DIST_PATH = isDev
  ? path.join(__dirname, '..', 'web', 'dist')
  : path.join(process.resourcesPath, 'web-dist');

/**
 * Ruta a la carpeta de skills geo-* que la app sincroniza en cada proyecto.
 * En desarrollo: ../skills del repo. En producción: skills empaquetadas.
 */
const SKILLS_SRC_PATH = isDev
  ? path.join(__dirname, '..', 'skills')
  : path.join(process.resourcesPath, 'skills');

// ─── Instancia única ────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Ya hay otra instancia corriendo; cerramos esta silenciosamente.
  app.quit();
}

// ─── Variables globales del proceso ──────────────────────────────────
/** @type {BrowserWindow|null} Referencia a la ventana principal */
let mainWindow = null;

/** @type {number|null} Puerto en el que escucha el servidor Express */
let serverPort = null;

// ─── Funciones auxiliares ────────────────────────────────────────────

/**
 * Inicia el servidor Express embebido en un puerto dinámico.
 * @returns {Promise<number>} El puerto asignado al servidor.
 */
async function startServer() {
  try {
    const { startServer: start } = require('./server/index');
    const resourcesPath = isDev ? __dirname : process.resourcesPath;
    const port = await start({ webDistPath: WEB_DIST_PATH, resourcesPath, isDev });
    console.log(`[GEO Engine] Servidor Express escuchando en el puerto ${port}`);
    return port;
  } catch (error) {
    console.error('[GEO Engine] Error al iniciar el servidor Express:', error);
    throw error;
  }
}

/**
 * Crea la ventana principal de la aplicación con las configuraciones de
 * seguridad y apariencia requeridas.
 * @param {number} port - Puerto del servidor Express local.
 * @returns {BrowserWindow} La ventana creada.
 */
function createMainWindow(port) {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Mostrar la ventana solo cuando el contenido esté listo (evita parpadeo)
  win.once('ready-to-show', () => {
    win.show();
  });

  // Cargar la app servida por Express
  win.loadURL(`http://127.0.0.1:${port}`);

  // Abrir DevTools automáticamente en desarrollo
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

// ─── Registro de manejadores IPC ─────────────────────────────────────

/**
 * Registra todos los manejadores IPC (invoke/handle) para la comunicación
 * segura entre el proceso renderer y el proceso principal.
 */
function registerIpcHandlers() {
  /**
   * Diálogo nativo para abrir archivo(s).
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {Electron.OpenDialogOptions} options
   */
  ipcMain.handle('dialog:openFile', async (_event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || 'Abrir archivo',
        filters: options.filters || [],
        properties: options.properties || ['openFile'],
        defaultPath: options.defaultPath || undefined,
      });
      return result;
    } catch (error) {
      console.error('[IPC] Error en dialog:openFile:', error);
      return { canceled: true, filePaths: [] };
    }
  });

  /**
   * Diálogo nativo para guardar archivo.
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {Electron.SaveDialogOptions} options
   */
  ipcMain.handle('dialog:saveFile', async (_event, options = {}) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title || 'Guardar archivo',
        filters: options.filters || [],
        defaultPath: options.defaultPath || undefined,
      });
      return result;
    } catch (error) {
      console.error('[IPC] Error en dialog:saveFile:', error);
      return { canceled: true, filePath: undefined };
    }
  });

  /**
   * Diálogo nativo para seleccionar directorio.
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {Electron.OpenDialogOptions} options
   */
  ipcMain.handle('dialog:openDirectory', async (_event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || 'Seleccionar carpeta',
        properties: ['openDirectory', ...(options.properties || [])],
        defaultPath: options.defaultPath || undefined,
      });
      return result;
    } catch (error) {
      console.error('[IPC] Error en dialog:openDirectory:', error);
      return { canceled: true, filePaths: [] };
    }
  });

  /**
   * Devuelve información general de la aplicación.
   */
  ipcMain.handle('app:getInfo', () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev,
    };
  });

  /**
   * Abre una URL en el navegador predeterminado del sistema.
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {string} url
   */
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    try {
      if (typeof url !== 'string' || !url.startsWith('http')) {
        throw new Error(`URL inválida: ${url}`);
      }
      await shell.openExternal(url);
    } catch (error) {
      console.error('[IPC] Error en shell:openExternal:', error);
    }
  });

  /**
   * Escribe contenido en un archivo del sistema de archivos.
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {string} filePath - Ruta absoluta del archivo.
   * @param {string} content - Contenido a escribir.
   */
  ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
    try {
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        throw new Error('Se requiere una ruta absoluta para escribir el archivo.');
      }
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error en fs:writeFile:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Lee el contenido de un archivo del sistema de archivos.
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {string} filePath - Ruta absoluta del archivo.
   */
  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    try {
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        throw new Error('Se requiere una ruta absoluta para leer el archivo.');
      }
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      console.error('[IPC] Error en fs:readFile:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Cierra la app e instala la actualización.
   */
  ipcMain.handle('app:quitAndInstall', () => {
    try {
      autoUpdater.quitAndInstall();
    } catch (error) {
      console.error('[IPC] Error en app:quitAndInstall:', error);
    }
  });

  // ── Proyecto de curso (.geocurso) ──────────────────────────────────
  /** Envuelve una operación de proyecto devolviendo {ok, data|error}. @param {() => any} fn */
  const safe = (fn) => {
    try {
      return { ok: true, data: fn() };
    } catch (error) {
      console.error('[IPC:project]', error.message);
      return { ok: false, error: error.message };
    }
  };

  /** Igual que `safe` pero espera una promesa. @param {() => Promise<any>} fn */
  const safeAsync = async (fn) => {
    try {
      return { ok: true, data: await fn() };
    } catch (error) {
      console.error('[IPC:async]', error.message);
      return { ok: false, error: error.message };
    }
  };

  ipcMain.handle('project:create', (_e, parentDir, name) =>
    safe(() => project.openProject(project.createProject(parentDir, name).path)));

  ipcMain.handle('project:open', (_e, projectPath) =>
    safe(() => project.openProject(projectPath)));

  ipcMain.handle('project:saveConfig', (_e, projectPath, config) =>
    safe(() => project.saveConfig(projectPath, config)));

  ipcMain.handle('project:import', (_e, plantillaDir, parentDir, name) =>
    safe(() => project.importPlantilla(plantillaDir, parentDir, name)));

  ipcMain.handle('project:readGenerated', (_e, projectPath, fileName) =>
    safe(() => project.readGenerated(projectPath, fileName)));

  ipcMain.handle('project:addInsumos', (_e, projectPath, filePaths) =>
    safe(() => project.addInsumos(projectPath, filePaths)));

  // ── Agente (Agent SDK embebido) ────────────────────────────────────
  const userDataPath = app.getPath('userData');

  ipcMain.handle('agent:status', () =>
    safeAsync(() => agent.getStatus(userDataPath, safeStorage)));

  ipcMain.handle('agent:select', (_e, agentId) =>
    safeAsync(() => agent.selectAgent(userDataPath, safeStorage, agentId)));

  ipcMain.handle('agent:setToken', (_e, agentId, token) =>
    safeAsync(() => agent.setToken(userDataPath, safeStorage, agentId, token)));

  ipcMain.handle('agent:clearToken', (_e, agentId) =>
    safeAsync(() => agent.clearToken(userDataPath, safeStorage, agentId)));

  ipcMain.handle('agent:setCommand', (_e, agentId, command) =>
    safeAsync(() => agent.setCommand(userDataPath, safeStorage, agentId, command)));

  ipcMain.handle('agent:generate', async (_e, projectPath, structure) => {
    try {
      const result = await agent.generate({
        projectPath,
        structure,
        skillsSrcPath: SKILLS_SRC_PATH,
        userDataPath,
        safeStorage,
        onEvent: (event) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('agent:event', { structureId: structure.id, ...event });
          }
        },
      });
      return { ok: result.ok, data: result, error: result.error };
    } catch (error) {
      console.error('[IPC:agent]', error.message);
      return { ok: false, error: error.message };
    }
  });
}

// ─── Configuración de Auto-Updater ───────────────────────────────────
/**
 * Configura el sistema de actualizaciones automáticas.
 */
function setupAutoUpdater() {
  // Desactivar descarga automática para pedir confirmación al usuario primero
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Actualización disponible:', info.version);
    
    // Notificar al frontend
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', info);
    }

    // Mostrar cuadro de diálogo interactivo al usuario
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Actualización disponible',
      message: `Una nueva versión de GEO Engine (v${info.version}) está disponible. ¿Deseas descargarla e instalarla ahora?`,
      buttons: ['Descargar e instalar', 'No, después'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        console.log('[Updater] Iniciando descarga de la actualización...');
        autoUpdater.downloadUpdate();
        
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Descargando',
          message: 'La actualización se está descargando en segundo plano. Se te notificará cuando esté lista.'
        });
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Actualización descargada:', info.version);
    
    // Notificar al frontend
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:downloaded', info);
    }

    // Preguntar si desea reiniciar ahora
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Actualización lista',
      message: `La versión v${info.version} ha sido descargada con éxito. ¿Deseas reiniciar la aplicación ahora para aplicar la actualización?`,
      buttons: ['Reiniciar y actualizar', 'Más tarde'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error de actualización:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:error', err ? err.message : 'Error desconocido');
    }
  });
}

// ─── Ciclo de vida de la aplicación ──────────────────────────────────

app.whenReady().then(async () => {
  try {
    // 1. Arrancar el servidor Express embebido
    serverPort = await startServer();

    // 2. Registrar manejadores IPC antes de crear la ventana
    registerIpcHandlers();

    // 3. Configurar auto-updater
    setupAutoUpdater();

    // 4. Crear la ventana principal
    mainWindow = createMainWindow(serverPort);

    // 5. Configurar el menú nativo
    const appMenu = buildMenu(mainWindow);
    Menu.setApplicationMenu(appMenu);

    // 6. Iniciar comprobación de actualizaciones si es producción
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('[Updater] Falló al iniciar comprobación de actualización:', err.message);
      });
    }

    // 7. Manejar la segunda instancia (enfocar la ventana existente)
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  } catch (error) {
    console.error('[GEO Engine] Error fatal durante la inicialización:', error);
    app.quit();
  }
});

// En macOS, recrear la ventana al hacer clic en el ícono del dock
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
    mainWindow = createMainWindow(serverPort);
    const appMenu = buildMenu(mainWindow);
    Menu.setApplicationMenu(appMenu);
  }
});

// Cerrar la app cuando todas las ventanas se cierren (excepto en macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
