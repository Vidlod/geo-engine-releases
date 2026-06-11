'use strict';

/**
 * @fileoverview Menú nativo de la aplicación GEO Engine Desktop.
 *
 * Construye la barra de menús con secciones en español:
 *  - Archivo, Editar, Vista, Herramientas, Ventana, Ayuda
 *
 * Las funcionalidades futuras (Workspace, Saneador, Mapeador, etc.)
 * aparecen deshabilitadas con la sublabel "Próximamente".
 */

const { Menu, dialog, app } = require('electron');

/**
 * Construye y retorna el menú de la aplicación.
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal para envío de IPC.
 * @returns {Electron.Menu} Menú configurado listo para asignar.
 */
function buildMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    // ─── Menú de la App (solo macOS) ─────────────────────────────
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'Acerca de GEO Engine' },
              { type: 'separator' },
              { role: 'services', label: 'Servicios' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar GEO Engine' },
              { role: 'hideOthers', label: 'Ocultar otros' },
              { role: 'unhide', label: 'Mostrar todo' },
              { type: 'separator' },
              { role: 'quit', label: 'Salir de GEO Engine' },
            ],
          },
        ]
      : []),

    // ─── Archivo ─────────────────────────────────────────────────
    {
      label: 'Archivo',
      submenu: [
        {
          label: '📂 Abrir archivo…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:action', { action: 'open-file' });
            }
          },
        },
        { type: 'separator' },
        {
          label: '📁 Workspace…',
          enabled: false,
          sublabel: 'Próximamente',
        },
        {
          label: '🧹 Saneador…',
          enabled: false,
          sublabel: 'Próximamente',
        },
        { type: 'separator' },
        isMac
          ? { role: 'close', label: 'Cerrar ventana' }
          : { role: 'quit', label: 'Salir' },
      ],
    },

    // ─── Editar ──────────────────────────────────────────────────
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },

    // ─── Vista ───────────────────────────────────────────────────
    {
      label: 'Vista',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom original' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },

    // ─── Herramientas ────────────────────────────────────────────
    {
      label: 'Herramientas',
      submenu: [
        {
          label: '🔗 Mapeador de Enlaces',
          enabled: false,
          sublabel: 'Próximamente',
        },
        {
          label: '✅ Validador One-Click',
          enabled: false,
          sublabel: 'Próximamente',
        },
        { type: 'separator' },
        {
          label: '🧩 Gestor de Skills',
          enabled: false,
          sublabel: 'Próximamente',
        },
      ],
    },

    // ─── Ventana ─────────────────────────────────────────────────
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: '↕️ Zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: 'Traer todo al frente' },
            ]
          : []),
      ],
    },

    // ─── Desarrollo (Solo en Dev Mode) ───────────────────────────
    ...(!app.isPackaged
      ? [
          {
            label: 'Desarrollo',
            submenu: [
              {
                label: '🔄 Simular actualización disponible',
                click: () => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update:available', { version: '2.0.0-demo' });
                    // Simular descarga completada tras 4 segundos
                    setTimeout(() => {
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update:downloaded', { version: '2.0.0-demo' });
                      }
                    }, 4000);
                  }
                },
              },
            ],
          },
        ]
      : []),

    // ─── Ayuda ───────────────────────────────────────────────────
    {
      label: 'Ayuda',
      submenu: [
        {
          label: '🗺️ Roadmap',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Roadmap — GEO Engine Desktop',
              message: 'Funcionalidades planificadas',
              detail: [
                '📂  Workspace — Gestión de proyectos por curso',
                '🧹  Saneador — Limpieza masiva de HTML pegado desde Word',
                '🔗  Mapeador de Enlaces — Detección y reemplazo de URLs',
                '✅  Validador One-Click — Revisión automática de estándares GEO',
                '🧩  Gestor de Skills — Administración de habilidades del agente IA',
                '',
                'Estas funcionalidades se irán habilitando en próximas versiones.',
              ].join('\n'),
              buttons: ['Entendido'],
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Acerca de GEO Engine',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Acerca de GEO Engine',
              message: `GEO Engine Desktop v${app.getVersion()}`,
              detail: [
                'Motor de maquetación para cursos Moodle — UDES',
                '',
                `Plataforma: ${process.platform} (${process.arch})`,
                `Electron: ${process.versions.electron}`,
                `Chrome: ${process.versions.chrome}`,
                `Node.js: ${process.versions.node}`,
                '',
                '© 2024-2026 — Equipo GEO / UDES',
              ].join('\n'),
              buttons: ['Cerrar'],
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
