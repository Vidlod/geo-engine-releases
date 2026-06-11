'use strict';

/**
 * @fileoverview Script de precarga (preload) para GEO Engine Desktop.
 *
 * Expone una API segura (`electronAPI`) al proceso renderer a través de
 * contextBridge. Esto permite que el frontend acceda a funcionalidades
 * nativas sin habilitar nodeIntegration.
 *
 * Seguridad:
 *  - contextIsolation está habilitado (los contextos están separados).
 *  - Solo se exponen canales IPC específicos y conocidos.
 *  - No se expone `ipcRenderer` directamente al renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

// ─── Canales IPC permitidos ──────────────────────────────────────────
/** @type {string[]} Lista blanca de canales válidos para invoke */
const VALID_CHANNELS = [
  'dialog:openFile',
  'dialog:saveFile',
  'dialog:openDirectory',
  'app:getInfo',
  'shell:openExternal',
  'fs:writeFile',
  'fs:readFile',
  'app:quitAndInstall',
  'project:create',
  'project:open',
  'project:saveConfig',
  'project:import',
  'project:readGenerated',
  'project:addInsumos',
  'agent:status',
  'agent:select',
  'agent:setToken',
  'agent:clearToken',
  'agent:setCommand',
  'agent:generate',
];

// ─── API expuesta al renderer ────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Abre un diálogo nativo para seleccionar archivo(s).
   * @param {object} [options] - Opciones del diálogo (title, filters, properties, defaultPath).
   * @returns {Promise<Electron.OpenDialogReturnValue>}
   */
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),

  /**
   * Abre un diálogo nativo para guardar un archivo.
   * @param {object} [options] - Opciones del diálogo (title, filters, defaultPath).
   * @returns {Promise<Electron.SaveDialogReturnValue>}
   */
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  /**
   * Abre un diálogo nativo para seleccionar un directorio.
   * @param {object} [options] - Opciones del diálogo (title, defaultPath).
   * @returns {Promise<Electron.OpenDialogReturnValue>}
   */
  openDirectory: (options) => ipcRenderer.invoke('dialog:openDirectory', options),

  /**
   * Obtiene información general de la aplicación.
   * @returns {Promise<{version: string, platform: string, arch: string, isDev: boolean}>}
   */
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),

  /**
   * Abre una URL en el navegador predeterminado del sistema.
   * @param {string} url - URL a abrir (debe comenzar con http/https).
   * @returns {Promise<void>}
   */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  /**
   * Escribe contenido en un archivo del sistema de archivos.
   * @param {string} filePath - Ruta absoluta del archivo destino.
   * @param {string} content - Contenido a escribir.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),

  /**
   * Lee el contenido de un archivo del sistema de archivos.
   * @param {string} filePath - Ruta absoluta del archivo a leer.
   * @returns {Promise<{success: boolean, content?: string, error?: string}>}
   */
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),

  /**
   * Registra un callback para recibir acciones enviadas desde el menú nativo.
   * El callback recibe un objeto con la propiedad `action` (ej: 'open-file').
   * @param {(data: {action: string}) => void} callback
   * @returns {() => void} Función para desuscribirse del listener.
   */
  onMenuAction: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event */
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('menu:action', handler);

    // Retornar función de limpieza para evitar fugas de memoria
    return () => {
      ipcRenderer.removeListener('menu:action', handler);
    };
  },

  /**
   * Registra un callback para cuando hay una actualización disponible.
   * @param {(info: any) => void} callback
   * @returns {() => void} Función de desuscripción.
   */
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => {
      ipcRenderer.removeListener('update:available', handler);
    };
  },

  /**
   * Registra un callback para cuando la actualización ha sido descargada y está lista.
   * @param {(info: any) => void} callback
   * @returns {() => void} Función de desuscripción.
   */
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:downloaded', handler);
    return () => {
      ipcRenderer.removeListener('update:downloaded', handler);
    };
  },

  /**
   * Registra un callback para cuando ocurre un error durante la actualización.
   * @param {(error: any) => void} callback
   * @returns {() => void} Función de desuscripción.
   */
  onUpdateError: (callback) => {
    const handler = (_event, error) => callback(error);
    ipcRenderer.on('update:error', handler);
    return () => {
      ipcRenderer.removeListener('update:error', handler);
    };
  },

  /**
   * Reinicia la aplicación e instala la actualización descargada.
   */
  quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall'),

  // ─── Proyecto de curso (.geocurso) ─────────────────────────────────
  project: {
    /**
     * Crea un proyecto nuevo y lo devuelve abierto.
     * @param {string} parentDir @param {string} name
     */
    create: (parentDir, name) => ipcRenderer.invoke('project:create', parentDir, name),

    /** Abre un proyecto existente. @param {string} projectPath */
    open: (projectPath) => ipcRenderer.invoke('project:open', projectPath),

    /** Guarda la configuración del curso. @param {string} projectPath @param {object} config */
    saveConfig: (projectPath, config) => ipcRenderer.invoke('project:saveConfig', projectPath, config),

    /**
     * Importa una carpeta PLANTILLA_CURSO como proyecto nuevo.
     * @param {string} plantillaDir @param {string} parentDir @param {string} name
     */
    importPlantilla: (plantillaDir, parentDir, name) =>
      ipcRenderer.invoke('project:import', plantillaDir, parentDir, name),

    /** Lee un HTML de generadas/. @param {string} projectPath @param {string} fileName */
    readGenerated: (projectPath, fileName) =>
      ipcRenderer.invoke('project:readGenerated', projectPath, fileName),

    /** Copia archivos a insumos/. @param {string} projectPath @param {string[]} filePaths */
    addInsumos: (projectPath, filePaths) =>
      ipcRenderer.invoke('project:addInsumos', projectPath, filePaths),
  },

  // ─── Agentes (Claude SDK + Antigravity CLI) ────────────────────────
  agent: {
    /** Estado de todos los agentes + cuál está seleccionado. */
    status: () => ipcRenderer.invoke('agent:status'),

    /** Cambia el agente activo. @param {string} agentId */
    select: (agentId) => ipcRenderer.invoke('agent:select', agentId),

    /** Guarda el token/API key cifrado de un agente. @param {string} agentId @param {string} token */
    setToken: (agentId, token) => ipcRenderer.invoke('agent:setToken', agentId, token),

    /** Olvida el token guardado de un agente. @param {string} agentId */
    clearToken: (agentId) => ipcRenderer.invoke('agent:clearToken', agentId),

    /** Cambia el comando de un agente CLI. @param {string} agentId @param {string} command */
    setCommand: (agentId, command) => ipcRenderer.invoke('agent:setCommand', agentId, command),

    /**
     * Genera una estructura con el agente seleccionado (eventos por onEvent).
     * @param {string} projectPath @param {object} structure
     */
    generate: (projectPath, structure) =>
      ipcRenderer.invoke('agent:generate', projectPath, structure),

    /**
     * Suscribe a los eventos de progreso de la generación.
     * @param {(event: {structureId:string,type:string,message:string}) => void} callback
     * @returns {() => void} desuscripción
     */
    onEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('agent:event', handler);
      return () => ipcRenderer.removeListener('agent:event', handler);
    },
  },
});
