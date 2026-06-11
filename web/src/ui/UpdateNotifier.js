/**
 * @fileoverview Componente de notificación de actualizaciones.
 *
 * Muestra una tarjeta flotante en la esquina inferior izquierda con diseño
 * premium, glassmorphism, micro-animaciones y controles interactivos para
 * descargar e instalar actualizaciones del sistema.
 */

export class UpdateNotifier {
  constructor() {
    this.container = null;
    this._styleAdded = false;
    this.init();
  }

  init() {
    // Solo registrar listeners si estamos en el entorno de Electron (electronAPI disponible)
    if (!window.electronAPI) return;

    this._injectStyles();

    // Registrar callbacks de actualización
    window.electronAPI.onUpdateAvailable((info) => {
      this.showNotification('available', info);
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      this.showNotification('downloaded', info);
    });

    window.electronAPI.onUpdateError((err) => {
      console.error('[UpdateNotifier] Error de actualización:', err);
    });
  }

  /**
   * Inyecta dinámicamente los estilos CSS en el head del documento.
   * @private
   */
  _injectStyles() {
    if (this._styleAdded) return;
    
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .update-toast {
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 9999;
        width: 320px;
        padding: 16px;
        background: rgba(15, 15, 25, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
        color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: auto;
        animation: slide-up-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .update-toast__header {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .update-toast__icon {
        font-size: 18px;
      }

      .update-toast__title {
        font-weight: 600;
        color: #ffffff;
      }

      .update-toast__body {
        color: #a0a0b0;
        font-size: 12px;
      }

      .update-toast__progress {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 2px;
        overflow: hidden;
        position: relative;
      }

      .update-toast__progress-bar {
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 30%;
        background: linear-gradient(90deg, #6366f1, #a855f7);
        border-radius: 2px;
        animation: progress-indeterminate 1.5s infinite linear;
      }

      .update-toast__actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }

      .update-toast__btn {
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: background 0.2s, transform 0.1s;
      }

      .update-toast__btn--primary {
        background: #6366f1;
        color: #ffffff;
      }

      .update-toast__btn--primary:hover {
        background: #4f46e5;
      }

      .update-toast__btn--primary:active {
        transform: scale(0.97);
      }

      .update-toast__btn--secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #e0e0e0;
      }

      .update-toast__btn--secondary:hover {
        background: rgba(255, 255, 255, 0.12);
      }

      .update-toast__btn--secondary:active {
        transform: scale(0.97);
      }

      .update-toast.fade-out {
        animation: slide-down-fade-out 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @keyframes slide-up-fade-in {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      @keyframes slide-down-fade-out {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(20px);
          opacity: 0;
        }
      }

      @keyframes progress-indeterminate {
        0% {
          left: -30%;
          width: 30%;
        }
        50% {
          left: 40%;
          width: 40%;
        }
        100% {
          left: 100%;
          width: 30%;
        }
      }
    `;
    document.head.appendChild(styleEl);
    this._styleAdded = true;
  }

  /**
   * Muestra la tarjeta de notificación.
   * @param {'available'|'downloaded'} status - Estado actual.
   * @param {object} info - Información de versión.
   */
  showNotification(status, info) {
    if (this.container) {
      this.container.remove();
    }

    const version = info ? info.version : 'nueva';
    
    this.container = document.createElement('div');
    this.container.className = 'update-toast';
    
    if (status === 'available') {
      this.container.innerHTML = `
        <div class="update-toast__header">
          <span class="update-toast__icon">🔄</span>
          <strong class="update-toast__title">Actualización disponible</strong>
        </div>
        <div class="update-toast__body">
          Descargando la versión v${version} en segundo plano...
        </div>
        <div class="update-toast__progress">
          <div class="update-toast__progress-bar"></div>
        </div>
      `;
    } else if (status === 'downloaded') {
      this.container.innerHTML = `
        <div class="update-toast__header">
          <span class="update-toast__icon">🎉</span>
          <strong class="update-toast__title">¡Actualización lista!</strong>
        </div>
        <div class="update-toast__body">
          La versión v${version} se descargó correctamente. Reinicia para aplicar los cambios.
        </div>
        <div class="update-toast__actions">
          <button class="update-toast__btn update-toast__btn--primary" id="btn-update-restart">Reiniciar ahora</button>
          <button class="update-toast__btn update-toast__btn--secondary" id="btn-update-close">Luego</button>
        </div>
      `;
    }

    document.body.appendChild(this.container);

    if (status === 'downloaded') {
      const btnRestart = this.container.querySelector('#btn-update-restart');
      const btnClose = this.container.querySelector('#btn-update-close');

      btnRestart.addEventListener('click', () => {
        window.electronAPI.quitAndInstall();
      });

      btnClose.addEventListener('click', () => {
        this.container.classList.add('fade-out');
        setTimeout(() => {
          if (this.container) this.container.remove();
        }, 300);
      });
    }
  }
}
