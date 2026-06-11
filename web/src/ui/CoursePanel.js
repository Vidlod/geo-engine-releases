/**
 * @fileoverview Vista "Proyecto de curso" — orquestador del flujo con agente.
 *
 * Solo disponible en la app de escritorio (requiere window.electronAPI.project).
 * Gestiona la carpeta .geocurso del curso: insumos, configuración, checklist de
 * estructuras con estado, generación headless con el Agent SDK embebido
 * (progreso en vivo) y FLAGS como tarjetas accionables.
 *
 * @module ui/CoursePanel
 */

import { showToast } from './Toast.js';

/** @returns {any|null} API de proyecto del preload, si existe. */
export function projectApi() {
  const api = /** @type {any} */ (window).electronAPI;
  return api && api.project ? api : null;
}

export class CoursePanel {
  /**
   * @param {HTMLElement} containerEl
   * @param {object} callbacks
   * @param {(name: string, html: string, redFiles?: string[]) => void} callbacks.onLoadHtml
   * @param {() => void} callbacks.onBack
   */
  constructor(containerEl, callbacks) {
    /** @private */ this._el = containerEl;
    /** @private */ this._cb = callbacks;
    /** @private {any|null} Proyecto abierto (resultado de project:open) */
    this._project = null;
    /** @private {any} Estado del agente {sdkAvailable, hasCredential, credentialSource} */
    this._agent = { sdkAvailable: false, hasCredential: false, credentialSource: null };
    /** @private {string|null} id de la estructura generándose */
    this._busy = null;
    /** @private {string[]} líneas de progreso de la generación en curso */
    this._log = [];
    /** @private {(() => void)|null} */
    this._unsubscribe = null;
  }

  /* ── Ciclo de vida ───────────────────────────────────────── */

  async render() {
    const api = projectApi();
    if (!api) return;

    if (!this._unsubscribe && api.agent && api.agent.onEvent) {
      this._unsubscribe = api.agent.onEvent((ev) => this._onAgentEvent(ev));
    }
    const status = await api.agent.status();
    if (status.ok) this._agent = status.data;

    this._project ? this._renderProject() : this._renderEmpty();
  }

  /* ── Estado vacío: crear / abrir / importar ──────────────── */

  /** @private */
  _renderEmpty() {
    this._el.innerHTML = `
      <button type="button" class="btn btn--ghost dropzone-view__back" id="geo-course-back">← Inicio</button>
      <div class="course-empty">
        <div class="course-empty__hero">
          <span class="home__badge">Flujo con agente</span>
          <h2 class="course-empty__title">Proyecto de curso</h2>
          <p class="course-empty__sub">Una carpeta por curso: insumos, configuración y páginas generadas.
          El agente ejecuta las skills GEO y tú revisas el resultado en el editor.</p>
        </div>
        <div class="course-empty__actions">
          <button type="button" class="course-action" id="geo-course-new">
            <span class="course-action__icon">+</span>
            <span class="course-action__title">Crear curso</span>
            <span class="course-action__desc">Carpeta nueva con insumos/ y generadas/.</span>
          </button>
          <button type="button" class="course-action" id="geo-course-open">
            <span class="course-action__icon">⌂</span>
            <span class="course-action__title">Abrir proyecto</span>
            <span class="course-action__desc">Selecciona una carpeta .geocurso existente.</span>
          </button>
          <button type="button" class="course-action" id="geo-course-import">
            <span class="course-action__icon">⇪</span>
            <span class="course-action__title">Importar PLANTILLA_CURSO</span>
            <span class="course-action__desc">Convierte la estructura clásica de VS Code.</span>
          </button>
        </div>
      </div>`;

    this._el.querySelector('#geo-course-back').addEventListener('click', () => this._cb.onBack());
    this._el.querySelector('#geo-course-new').addEventListener('click', () => this._create());
    this._el.querySelector('#geo-course-open').addEventListener('click', () => this._open());
    this._el.querySelector('#geo-course-import').addEventListener('click', () => this._import());
  }

  /** @private */
  async _create() {
    const api = projectApi();
    const name = await this._askText({
      title: 'Crear curso',
      label: 'Nombre del curso',
      placeholder: 'Ej: Introducción a la Criminología',
      confirmLabel: 'Crear',
      hint: 'Después elegirás la carpeta donde guardar el proyecto.',
    });
    if (!name) return;
    const dir = await api.openDirectory({ title: 'Carpeta donde crear el proyecto' });
    if (dir.canceled || !dir.filePaths.length) return;
    const res = await api.project.create(dir.filePaths[0], name);
    this._afterOpen(res, `Proyecto creado: ${name}`);
  }

  /** @private */
  async _open() {
    const api = projectApi();
    const dir = await api.openDirectory({ title: 'Selecciona la carpeta .geocurso' });
    if (dir.canceled || !dir.filePaths.length) return;
    const res = await api.project.open(dir.filePaths[0]);
    this._afterOpen(res, 'Proyecto abierto');
  }

  /** @private */
  async _import() {
    const api = projectApi();
    const src = await api.openDirectory({ title: 'Carpeta PLANTILLA_CURSO a importar' });
    if (src.canceled || !src.filePaths.length) return;
    const name = await this._askText({
      title: 'Importar PLANTILLA_CURSO',
      label: 'Nombre del curso importado',
      placeholder: 'Ej: Estadística Descriptiva',
      confirmLabel: 'Importar',
      hint: 'Después elegirás la carpeta donde guardar el proyecto nuevo.',
    });
    if (!name) return;
    const dst = await api.openDirectory({ title: 'Carpeta donde crear el proyecto' });
    if (dst.canceled || !dst.filePaths.length) return;
    const res = await api.project.importPlantilla(src.filePaths[0], dst.filePaths[0], name);
    this._afterOpen(res, 'Curso importado desde PLANTILLA_CURSO');
  }

  /**
   * @private
   * @param {{ok: boolean, data?: any, error?: string}} res
   * @param {string} okMsg
   */
  _afterOpen(res, okMsg) {
    if (!res.ok) {
      showToast(res.error || 'No se pudo abrir el proyecto', 'error');
      return;
    }
    this._project = res.data;
    showToast(okMsg, 'success');
    this._renderProject();
  }

  /* ── Vista del proyecto ──────────────────────────────────── */

  /** @private */
  _renderProject() {
    const p = this._project;
    const agentChip = this._agentChipHtml();

    const rows = p.structures.map((s) => this._structureRowHtml(s)).join('');

    this._el.innerHTML = `
      <button type="button" class="btn btn--ghost dropzone-view__back" id="geo-course-back">← Inicio</button>
      <div class="course">
        <header class="course__head">
          <div class="course__id">
            <h2 class="course__name">${esc(p.name)}</h2>
            <span class="course__path">${esc(p.path)}</span>
          </div>
          <div class="course__agent">${agentChip}</div>
        </header>

        <div class="course__meta">
          <label class="course__field">Momentos
            <input type="number" min="1" max="6" id="geo-course-momentos" value="${Number(p.config.momentos) || 1}">
          </label>
          <label class="course__field">Avances
            <input type="number" min="0" max="12" id="geo-course-avances" value="${Number(p.config.avances) || 0}">
          </label>
          <label class="course__field">Último avance
            <input type="number" min="0" max="12" id="geo-course-last" value="${Number(p.config.last_avance) || 0}">
          </label>
          <button type="button" class="btn btn--ghost course__meta-btn" id="geo-course-insumos">
            + Insumos <span class="course__count">${p.insumos.length}</span>
          </button>
          <button type="button" class="btn btn--ghost course__meta-btn" id="geo-course-close">Cerrar proyecto</button>
        </div>

        <div class="course__list" id="geo-course-list">${rows}</div>

        <div class="course__progress hidden" id="geo-course-progress">
          <div class="course__progress-head">
            <span class="spinner"></span>
            <span id="geo-course-progress-title">Generando…</span>
          </div>
          <div class="course__progress-log" id="geo-course-progress-log"></div>
        </div>
      </div>`;

    this._el.querySelector('#geo-course-back').addEventListener('click', () => this._cb.onBack());
    this._el.querySelector('#geo-course-close').addEventListener('click', () => {
      this._project = null;
      this._renderEmpty();
    });
    this._el.querySelector('#geo-course-insumos').addEventListener('click', () => this._addInsumos());

    for (const id of ['momentos', 'avances', 'last']) {
      this._el.querySelector(`#geo-course-${id}`).addEventListener('change', () => this._saveConfig());
    }

    const connectBtn = this._el.querySelector('#geo-course-connect');
    if (connectBtn) connectBtn.addEventListener('click', () => this._connectDialog());
    const disconnectBtn = this._el.querySelector('#geo-course-disconnect');
    if (disconnectBtn) disconnectBtn.addEventListener('click', () => this._disconnect());

    this._bindStructureRows();
  }

  /** @private @returns {string} */
  _agentChipHtml() {
    const a = this._agent;
    if (!a.sdkAvailable) {
      return `<span class="course-chip course-chip--off">Motor IA no disponible</span>`;
    }
    if (a.hasCredential) {
      const src = { app: 'token guardado', env: 'variable de entorno', cli: 'sesión de Claude Code' }[a.credentialSource] || '';
      return `
        <span class="course-chip course-chip--on">Claude conectado · ${esc(src)}</span>
        ${a.credentialSource === 'app'
          ? '<button type="button" class="btn btn--ghost btn--sm" id="geo-course-disconnect">Desconectar</button>'
          : ''}`;
    }
    return `
      <span class="course-chip course-chip--warn">Sin cuenta conectada</span>
      <button type="button" class="btn btn--primary btn--sm" id="geo-course-connect">Conectar Claude</button>`;
  }

  /**
   * @private
   * @param {any} s estructura
   * @returns {string}
   */
  _structureRowHtml(s) {
    const dots = { 'sin-insumos': 'off', lista: 'ready', flags: 'warn', ok: 'ok' };
    const labels = { 'sin-insumos': 'Faltan insumos (AAA)', lista: 'Lista para generar', flags: `${s.flags.length} FLAG(s)`, ok: 'Generada' };
    const canGenerate = this._agent.sdkAvailable && this._agent.hasCredential && s.status !== 'sin-insumos';
    const generated = s.status === 'flags' || s.status === 'ok';
    const busy = this._busy === s.id;

    const flagCards = s.flags.map((f) => `
      <div class="course-flag">
        <span class="course-flag__type">${esc(f.type)}</span>
        <span class="course-flag__msg">${esc(f.message)}</span>
      </div>`).join('');
    const corrections = s.corrections.length
      ? `<div class="course-corrections"><strong>Correcciones de la IA:</strong><ul>${
          s.corrections.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`
      : '';

    return `
      <div class="course-row" data-id="${esc(s.id)}">
        <span class="course-row__dot course-row__dot--${dots[s.status]}"></span>
        <div class="course-row__info">
          <span class="course-row__label">${esc(s.label)}</span>
          <span class="course-row__status">${labels[s.status]}</span>
        </div>
        <div class="course-row__actions">
          ${generated ? `<button type="button" class="btn btn--ghost btn--sm" data-act="open">Abrir en editor</button>` : ''}
          ${s.flags.length ? `<button type="button" class="btn btn--ghost btn--sm" data-act="flags">FLAGS (${s.flags.length})</button>` : ''}
          ${canGenerate ? `<button type="button" class="btn btn--primary btn--sm" data-act="generate" ${busy ? 'disabled' : ''}>
            ${busy ? 'Generando…' : (generated ? '↻ Regenerar' : '⚡ Generar')}</button>` : ''}
        </div>
        <div class="course-row__detail hidden">${flagCards}${corrections}</div>
      </div>`;
  }

  /** @private */
  _bindStructureRows() {
    for (const row of this._el.querySelectorAll('.course-row')) {
      const id = row.getAttribute('data-id');
      const structure = this._project.structures.find((s) => s.id === id);
      if (!structure) continue;

      const openBtn = row.querySelector('[data-act="open"]');
      if (openBtn) openBtn.addEventListener('click', () => this._openGenerated(structure));

      const genBtn = row.querySelector('[data-act="generate"]');
      if (genBtn) genBtn.addEventListener('click', () => this._generate(structure));

      const flagsBtn = row.querySelector('[data-act="flags"]');
      if (flagsBtn) flagsBtn.addEventListener('click', () => {
        row.querySelector('.course-row__detail').classList.toggle('hidden');
      });
    }
  }

  /* ── Acciones ────────────────────────────────────────────── */

  /** @private */
  async _saveConfig() {
    const api = projectApi();
    const val = (id) => Number(/** @type {HTMLInputElement} */ (this._el.querySelector(`#geo-course-${id}`)).value) || 0;
    const res = await api.project.saveConfig(this._project.path, {
      momentos: val('momentos'),
      avances: val('avances'),
      last_avance: val('last'),
    });
    if (res.ok) {
      this._project = res.data;
      this._renderProject();
      showToast('Configuración guardada', 'success');
    } else {
      showToast(res.error || 'No se pudo guardar', 'error');
    }
  }

  /** @private */
  async _addInsumos() {
    const api = projectApi();
    const picked = await api.openFile({
      title: 'Añadir insumos al curso',
      properties: ['openFile', 'multiSelections'],
    });
    if (picked.canceled || !picked.filePaths.length) return;
    const res = await api.project.addInsumos(this._project.path, picked.filePaths);
    if (res.ok) {
      this._project = res.data;
      this._renderProject();
      showToast(`${picked.filePaths.length} insumo(s) añadidos`, 'success');
    } else {
      showToast(res.error || 'No se pudieron copiar los insumos', 'error');
    }
  }

  /** @private @param {any} structure */
  async _openGenerated(structure) {
    const api = projectApi();
    const res = await api.project.readGenerated(this._project.path, structure.file);
    if (!res.ok) {
      showToast(res.error || 'No se pudo leer el archivo', 'error');
      return;
    }
    // Los insumos del proyecto son los RED legítimos para @@PLUGINFILE@@
    this._cb.onLoadHtml(res.data.name, res.data.html, [...this._project.insumos]);
  }

  /** @private @param {any} structure */
  async _generate(structure) {
    if (this._busy) return;
    const api = projectApi();
    this._busy = structure.id;
    this._log = [];
    this._renderProject();
    this._showProgress(`Generando ${structure.label}…`);

    const res = await api.agent.generate(this._project.path, {
      id: structure.id,
      skill: structure.skill,
      file: structure.file,
      label: structure.label,
      numero: structure.numero,
    });

    this._busy = null;
    this._hideProgress();

    if (res.ok) {
      // Reabrir para recalcular estados y FLAGS
      const reopened = await api.project.open(this._project.path);
      if (reopened.ok) this._project = reopened.data;
      this._renderProject();
      showToast(`${structure.label} generada`, 'success');
    } else {
      this._renderProject();
      showToast(res.error || 'La generación falló', 'error');
    }
  }

  /** @private */
  async _connectDialog() {
    const token = await this._askText({
      title: 'Conectar Claude',
      label: 'Token de Claude o API key',
      placeholder: 'sk-ant-… o token de claude setup-token',
      confirmLabel: 'Conectar',
      password: true,
      hint: 'Cómo obtenerlo: en una terminal ejecuta «claude setup-token», inicia sesión ' +
        'en el navegador y copia el token resultante. También sirve una API key de ' +
        'Anthropic. Si ya usas Claude Code en esta máquina, tu sesión se detecta sola.',
    });
    if (!token) return;
    const api = projectApi();
    const res = await api.agent.setToken(token);
    if (res.ok) {
      this._agent = res.data;
      this._renderProject();
      showToast('Cuenta de Claude conectada', 'success');
    } else {
      showToast(res.error || 'No se pudo guardar el token', 'error');
    }
  }

  /** @private */
  async _disconnect() {
    const api = projectApi();
    const res = await api.agent.clearToken();
    if (res.ok) {
      this._agent = res.data;
      this._renderProject();
      showToast('Token olvidado', 'info');
    }
  }

  /* ── Modal de texto (window.prompt no existe en Electron) ── */

  /**
   * Pide un texto con un modal propio. Resuelve con el valor (trim) o null.
   * @private
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.label
   * @param {string} [opts.placeholder]
   * @param {string} [opts.hint]
   * @param {string} [opts.confirmLabel]
   * @param {boolean} [opts.password]
   * @returns {Promise<string|null>}
   */
  _askText({ title, label, placeholder = '', hint = '', confirmLabel = 'Aceptar', password = false }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'paste-modal-backdrop';
      backdrop.id = 'geo-course-modal';
      backdrop.innerHTML = `
        <div class="paste-modal paste-modal--compact" role="dialog" aria-modal="true" aria-labelledby="geo-course-modal-title">
          <div class="paste-modal__header">
            <h2 class="paste-modal__title" id="geo-course-modal-title">${esc(title)}</h2>
            <button type="button" class="paste-modal__close" id="geo-course-modal-close" aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <label class="paste-modal__label" for="geo-course-modal-input">${esc(label)}</label>
          <input type="${password ? 'password' : 'text'}" class="paste-modal__filename-input"
                 id="geo-course-modal-input" placeholder="${esc(placeholder)}"
                 spellcheck="false" autocomplete="off">
          ${hint ? `<p class="course-modal__hint">${esc(hint)}</p>` : ''}
          <div class="course-modal__actions">
            <button type="button" class="btn btn--ghost" id="geo-course-modal-cancel">Cancelar</button>
            <button type="button" class="btn btn--primary" id="geo-course-modal-ok" disabled>${esc(confirmLabel)}</button>
          </div>
        </div>`;

      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.classList.add('paste-modal-backdrop--open'));

      const input = /** @type {HTMLInputElement} */ (backdrop.querySelector('#geo-course-modal-input'));
      const okBtn = /** @type {HTMLButtonElement} */ (backdrop.querySelector('#geo-course-modal-ok'));

      /** @param {string|null} value */
      const close = (value) => {
        backdrop.classList.remove('paste-modal-backdrop--open');
        setTimeout(() => backdrop.remove(), 180);
        resolve(value);
      };

      input.addEventListener('input', () => { okBtn.disabled = !input.value.trim(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) close(input.value.trim());
        if (e.key === 'Escape') close(null);
      });
      okBtn.addEventListener('click', () => close(input.value.trim()));
      backdrop.querySelector('#geo-course-modal-cancel').addEventListener('click', () => close(null));
      backdrop.querySelector('#geo-course-modal-close').addEventListener('click', () => close(null));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });

      setTimeout(() => input.focus(), 50);
    });
  }

  /* ── Progreso de la generación ───────────────────────────── */

  /** @private @param {{structureId:string,type:string,message:string}} ev */
  _onAgentEvent(ev) {
    if (!this._busy || ev.structureId !== this._busy) return;
    this._log.push(ev.message);
    const log = this._el.querySelector('#geo-course-progress-log');
    if (log) {
      const line = document.createElement('div');
      line.className = `course__progress-line course__progress-line--${ev.type}`;
      line.textContent = ev.message;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
  }

  /** @private @param {string} title */
  _showProgress(title) {
    const box = this._el.querySelector('#geo-course-progress');
    if (!box) return;
    box.classList.remove('hidden');
    this._el.querySelector('#geo-course-progress-title').textContent = title;
    this._el.querySelector('#geo-course-progress-log').innerHTML = '';
  }

  /** @private */
  _hideProgress() {
    const box = this._el.querySelector('#geo-course-progress');
    if (box) box.classList.add('hidden');
  }
}

/** Escapa HTML. @param {string} s */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
