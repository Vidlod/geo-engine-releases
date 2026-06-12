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
    /** @private {{selected:string, agents:object[]}} Estado de todos los agentes */
    this._agentStatus = { selected: 'claude', agents: [] };
    /** @private {string|null} id de la estructura generándose */
    this._busy = null;
    /** @private {string[]} líneas de progreso de la generación en curso */
    this._log = [];
    /** @private {(() => void)|null} */
    this._unsubscribe = null;
    /** @private {number} marca de inicio de la generación (ms) */
    this._progressStart = 0;
    /** @private {ReturnType<typeof setInterval>|null} */
    this._progressTimer = null;
  }

  /* ── Ciclo de vida ───────────────────────────────────────── */

  async render() {
    const api = projectApi();
    if (!api) return;

    if (!this._unsubscribe && api.agent && api.agent.onEvent) {
      this._unsubscribe = api.agent.onEvent((ev) => this._onAgentEvent(ev));
    }
    const status = await api.agent.status();
    if (status.ok) this._agentStatus = status.data;

    this._project ? this._renderProject() : this._renderEmpty();
  }

  /** @private @returns {any} el agente seleccionado o un stub. */
  _selectedAgent() {
    const s = this._agentStatus;
    return s.agents.find((a) => a.id === s.selected) || { id: s.selected, available: false, hasCredential: false };
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

    const rows = p.structures.map((s) => this._structureRowHtml(s)).join('');

    this._el.innerHTML = `
      <button type="button" class="btn btn--ghost dropzone-view__back" id="geo-course-back">← Inicio</button>
      <div class="course">
        <header class="course__head">
          <div class="course__id">
            <h2 class="course__name">${esc(p.name)}</h2>
            <span class="course__path">${esc(p.path)}</span>
          </div>
        </header>

        ${this._agentBarHtml()}

        <div class="course__meta">
          <label class="course__field">Momentos
            <input type="number" min="1" max="6" id="geo-course-momentos" value="${Number(p.config.momentos) || 1}">
          </label>
          <label class="course__field">Avances
            <input type="number" min="0" max="12" id="geo-course-avances" value="${Number(p.config.avances) || 0}">
          </label>
          <span class="course__field-note">El avance de número mayor es el Producto Final.</span>
          <button type="button" class="btn btn--ghost course__meta-btn" id="geo-course-insumos">
            + Insumos <span class="course__count">${p.insumos.length}</span>
          </button>
          <button type="button" class="btn btn--ghost course__meta-btn" id="geo-course-close">Cerrar proyecto</button>
        </div>

        <div class="course__list" id="geo-course-list">${rows}</div>

        <div class="course__progress hidden" id="geo-course-progress" role="status" aria-live="polite">
          <div class="course__progress-bar"><span class="course__progress-bar-fill"></span></div>
          <div class="course__progress-head">
            <span class="course__progress-orb"></span>
            <div class="course__progress-headtext">
              <span class="course__progress-phase" id="geo-course-progress-title">Generando…</span>
              <span class="course__progress-activity" id="geo-course-progress-activity">Iniciando…</span>
            </div>
            <span class="course__progress-timer" id="geo-course-progress-timer">0:00</span>
          </div>
          <details class="course__progress-details">
            <summary>Ver actividad detallada</summary>
            <div class="course__progress-log" id="geo-course-progress-log"></div>
          </details>
        </div>
      </div>`;

    this._el.querySelector('#geo-course-back').addEventListener('click', () => this._cb.onBack());
    this._el.querySelector('#geo-course-close').addEventListener('click', () => {
      this._project = null;
      this._renderEmpty();
    });
    this._el.querySelector('#geo-course-insumos').addEventListener('click', () => this._addInsumos());

    for (const id of ['momentos', 'avances']) {
      this._el.querySelector(`#geo-course-${id}`).addEventListener('change', () => this._saveConfig());
    }

    this._bindAgentBar();
    this._bindStructureRows();
  }

  /* ── Barra de agentes (Claude / Antigravity) ─────────────── */

  /** @private @returns {string} */
  _agentBarHtml() {
    const sel = this._agentStatus.selected;
    const tiles = this._agentStatus.agents.map((a) => {
      const led = a.available && a.hasCredential ? 'on' : (a.available ? 'warn' : 'off');
      const status = this._agentStatusLabel(a);
      return `
        <button type="button" class="agent-tile agent-tile--${a.id}${a.id === sel ? ' agent-tile--active' : ''}"
                data-agent="${esc(a.id)}" aria-pressed="${a.id === sel}">
          <span class="agent-tile__led agent-tile__led--${led}"></span>
          <span class="agent-tile__body">
            <span class="agent-tile__name">${esc(a.label)}</span>
            <span class="agent-tile__status">${esc(status)}</span>
          </span>
          <span class="agent-tile__pick" aria-hidden="true">${a.id === sel ? '✓ activo' : 'usar'}</span>
        </button>`;
    }).join('');

    return `
      <section class="agent-bar" aria-label="Motor de generación">
        <div class="agent-bar__tiles">${tiles}</div>
        <div class="agent-bar__action" id="geo-agent-action">${this._agentActionHtml()}</div>
      </section>`;
  }

  /** @private @param {any} a @returns {string} */
  _agentStatusLabel(a) {
    if (!a.available) return a.kind === 'cli' ? 'CLI no instalado' : 'Motor no disponible';
    if (!a.hasCredential) return 'Sin sesión';
    if (a.account) return `Conectado · ${a.account}`;
    return 'Conectado';
  }

  /** Acción contextual del agente seleccionado. @private @returns {string} */
  _agentActionHtml() {
    const a = this._selectedAgent();

    // ── Selector de modelo ──
    // Para Antigravity las opciones son los IDs REALES que reporta el CLI
    // (`agy models`); la opción vacía usa el modelo por defecto del CLI.
    let modelOptions;
    if (a.id === 'claude') {
      modelOptions = [
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recomendado)' },
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (El más rápido)' },
        { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Máxima calidad)' },
        { value: 'custom', label: 'Otro modelo…' },
      ];
    } else {
      const reales = (Array.isArray(a.models) ? a.models : []).map((m) => ({ value: m, label: m }));
      modelOptions = [
        { value: '', label: 'Modelo por defecto del CLI (recomendado)' },
        ...reales,
        { value: 'custom', label: 'Otro modelo…' },
      ];
    }

    const isCustomModel = Boolean(a.model) && !modelOptions.slice(0, -1).some((opt) => opt.value === a.model);
    const selectedModelVal = isCustomModel ? 'custom' : (a.model || modelOptions[0].value);

    const selectHtml = `
      <div class="agent-action__model-select-wrapper">
        <span class="agent-action__label">Modelo</span>
        <select class="agent-action__select" id="geo-agent-model-select">
          ${modelOptions.map(opt => `<option value="${opt.value}" ${opt.value === selectedModelVal ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
        </select>
        ${isCustomModel ? `<span class="agent-action__model-val">(${esc(a.model)})</span>` : ''}
      </div>
    `;

    // Fila estándar de sesión activa: estado + Cerrar sesión (igual en ambos)
    const okRow = (detalle) => `
      <div class="agent-action__row">
        <span class="agent-action__ok">✓ ${esc(detalle)}</span>
        <button type="button" class="btn btn--ghost btn--sm" id="geo-agent-logout">Cerrar sesión</button>
      </div>`;

    if (a.kind === 'cli') {
      const cmd = a.command || 'antigravity';
      const advanced = `
        <details class="agent-action__advanced">
          <summary>Opciones avanzadas</summary>
          <div class="agent-action__row">
            <span class="agent-action__label">Comando</span>
            <code class="agent-action__cmd">${esc(cmd)}</code>
            <button type="button" class="btn btn--ghost btn--sm" id="geo-agent-command">Cambiar</button>
          </div>
        </details>`;

      if (!a.available) {
        return `
          <div class="agent-action__grid">
            <span class="agent-action__warn">El CLI de Antigravity no está instalado en este equipo.</span>
            ${advanced}
          </div>`;
      }

      if (!a.hasCredential) {
        return `
          <div class="agent-action__grid">
            <div class="agent-banner agent-banner--warn">
              <strong>Antigravity no tiene sesión en este equipo</strong><br>
              Pulsa <em>Iniciar sesión</em>: se abre una terminal con Antigravity que te
              llevará a Google una sola vez. Al terminar, vuelve y pulsa <em>Ya inicié sesión</em>.
              <div class="agent-banner__actions">
                <button type="button" class="btn btn--primary btn--sm" id="geo-agy-login">Iniciar sesión con Google</button>
                <button type="button" class="btn btn--ghost btn--sm" id="geo-agent-refresh">Ya inicié sesión ↻</button>
              </div>
            </div>
            ${advanced}
          </div>`;
      }

      return `
        <div class="agent-action__grid">
          ${okRow('Conectado · sesión del CLI')}
          ${selectHtml}
          ${advanced}
        </div>`;
    }

    // Claude (SDK)
    if (!a.available) {
      return `<span class="agent-action__warn">El motor no cargó. Reinicia la app; si persiste, reinstala.</span>`;
    }
    if (!a.hasCredential) {
      return `
        <div class="agent-action__grid">
          <div class="agent-banner agent-banner--info">
            <strong>Sin cuenta de Claude conectada</strong><br>
            Inicia sesión una sola vez con tu cuenta de Claude; la app la detecta sola.
            <div class="agent-banner__actions">
              <button type="button" class="btn btn--primary btn--sm" id="geo-agent-login-cc">Iniciar sesión (Claude Code)</button>
              <button type="button" class="btn btn--ghost btn--sm" id="geo-agent-refresh">Ya inicié sesión ↻</button>
              <button type="button" class="btn btn--ghost btn--sm" id="geo-agent-connect">Usar token/API key…</button>
            </div>
          </div>
        </div>`;
    }

    const detalle = a.account
      ? `Conectado · ${a.account}`
      : a.credentialSource === 'app'
        ? 'Conectado · token guardado en la app'
        : a.credentialSource === 'env'
          ? 'Conectado · variable de entorno'
          : 'Conectado';

    return `
      <div class="agent-action__grid">
        ${okRow(detalle)}
        ${selectHtml}
      </div>`;
  }

  /** @private */
  _bindAgentBar() {
    for (const tile of this._el.querySelectorAll('.agent-tile')) {
      tile.addEventListener('click', () => this._selectAgent(tile.getAttribute('data-agent')));
    }
    const connect = this._el.querySelector('#geo-agent-connect');
    if (connect) connect.addEventListener('click', () => this._connectDialog());
    const command = this._el.querySelector('#geo-agent-command');
    if (command) command.addEventListener('click', () => this._commandDialog());

    // Sesión: iniciar (Google / Claude Code), reverificar y cerrar
    const agyLogin = this._el.querySelector('#geo-agy-login');
    if (agyLogin) agyLogin.addEventListener('click', () => this._agyLogin());
    const ccLogin = this._el.querySelector('#geo-agent-login-cc');
    if (ccLogin) ccLogin.addEventListener('click', () => this._claudeCodeLogin());
    const refresh = this._el.querySelector('#geo-agent-refresh');
    if (refresh) refresh.addEventListener('click', () => this._refreshAgents(true));
    const logoutBtn = this._el.querySelector('#geo-agent-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this._logout());

    const modelSelect = this._el.querySelector('#geo-agent-model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (val === 'custom') {
          this._customModelDialog();
        } else {
          const res = await projectApi().agent.setModel(this._agentStatus.selected, val);
          if (res.ok) {
            this._agentStatus = res.data;
            this._renderProject();
            showToast('Modelo actualizado', 'success');
          } else {
            showToast(res.error || 'No se pudo cambiar el modelo', 'error');
          }
        }
      });
    }

    const customBtn = this._el.querySelector('#geo-agent-model-custom-btn');
    if (customBtn) {
      customBtn.addEventListener('click', () => this._customModelDialog());
    }
  }

  /**
   * Reverifica las sesiones (forzando la sonda del CLI si `force`) y repinta.
   * @private @param {boolean} [force]
   */
  async _refreshAgents(force = false) {
    const api = projectApi();
    try {
      if (force && api.agent.preflightAuth) await api.agent.preflightAuth(true);
      const res = await api.agent.status();
      if (!res.ok) {
        showToast(res.error || 'No se pudo refrescar el estado', 'error');
        return;
      }
      this._agentStatus = res.data;
      this._renderProject();
      if (force) {
        const a = this._selectedAgent();
        showToast(a.hasCredential ? '✓ Sesión detectada' : 'Aún no se detecta la sesión',
          a.hasCredential ? 'success' : 'info');
      }
    } catch (err) {
      showToast('No se pudo refrescar el estado: ' + (err && err.message), 'error');
    }
  }

  /** Cierra la sesión del agente activo. @private */
  async _logout() {
    const a = this._selectedAgent();
    if (a.id === 'claude' && a.credentialSource === 'cli') {
      const ok = window.confirm(
        'Esta es la sesión de Claude Code de tu equipo: cerrarla aquí también la cierra en la terminal. ¿Cerrar sesión?'
      );
      if (!ok) return;
    }
    const res = await projectApi().agent.logout(a.id);
    if (res.ok) showToast((res.data && res.data.message) || 'Sesión cerrada', 'success');
    else showToast(res.error || 'No se pudo cerrar la sesión', 'error');
    await this._refreshAgents(a.kind === 'cli');
  }

  /** Abre el inicio de sesión de Claude Code (terminal, una sola vez). @private */
  async _claudeCodeLogin() {
    const res = await projectApi().agent.login('claude');
    if (res.ok) showToast((res.data && res.data.message) || 'Se abrió la terminal de inicio de sesión.', 'info');
    else showToast(res.error || 'No se pudo abrir el inicio de sesión', 'error');
  }

  /**
   * Inicia sesión en Antigravity abriendo el CLI en una terminal. El propio
   * `agy` dirige el OAuth en el navegador (una sola vez) y guarda el token;
   * no intentamos interceptar la URL (eso terminaba en antigravity.google
   * sin login). Al volver, el usuario pulsa «Ya inicié sesión».
   * @private
   */
  async _agyLogin() {
    const api = projectApi();
    if (!api || !api.agent || !api.agent.login) {
      showToast('Inicio de sesión no disponible en esta versión', 'error');
      return;
    }
    try {
      const res = await api.agent.login('antigravity');
      if (res.ok) {
        showToast((res.data && res.data.message) ||
          'Se abrió una terminal con Antigravity. Inicia sesión y pulsa «Ya inicié sesión».', 'info');
      } else {
        showToast(res.error || 'No se pudo abrir el inicio de sesión', 'error');
      }
    } catch (err) {
      showToast('Error: ' + (err && err.message), 'error');
    }
  }

  /** @private @param {string} agentId */
  async _selectAgent(agentId) {
    if (agentId === this._agentStatus.selected) return;
    const res = await projectApi().agent.select(agentId);
    if (res.ok) {
      this._agentStatus = res.data;
      this._renderProject();
    }
  }

  /**
   * @private
   * @param {any} s estructura
   * @returns {string}
   */
  _structureRowHtml(s) {
    const dots = { 'sin-insumos': 'off', lista: 'ready', flags: 'warn', ok: 'ok' };
    const labels = { 'sin-insumos': 'Faltan insumos (AAA)', lista: 'Lista para generar', flags: `${s.flags.length} FLAG(s)`, ok: 'Generada' };
    const sel = this._selectedAgent();
    const canGenerate = sel.available && sel.hasCredential && s.status !== 'sin-insumos';
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

    const statusText = busy
      ? `<span class="course-row__busy"><span class="course-row__busy-dot"></span>${generated ? 'Regenerando' : 'Generando'}…</span>`
      : labels[s.status];

    return `
      <div class="course-row${busy ? ' course-row--busy' : ''}" data-id="${esc(s.id)}">
        <span class="course-row__dot course-row__dot--${dots[s.status]}"></span>
        <div class="course-row__info">
          <span class="course-row__label">${esc(s.label)}</span>
          <span class="course-row__status">${statusText}</span>
        </div>
        <div class="course-row__actions">
          ${generated ? `<button type="button" class="btn btn--ghost btn--sm" data-act="open" ${busy ? 'disabled' : ''}>Abrir en editor</button>` : ''}
          ${s.flags.length ? `<button type="button" class="btn btn--ghost btn--sm" data-act="flags">FLAGS (${s.flags.length})</button>` : ''}
          ${canGenerate ? `<button type="button" class="btn btn--primary btn--sm" data-act="generate" ${busy ? 'disabled' : ''}>
            ${busy ? '⏳ En curso…' : (generated ? '↻ Regenerar' : '⚡ Generar')}</button>` : ''}
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
    const wasGenerated = structure.status === 'flags' || structure.status === 'ok';
    const verbo = wasGenerated ? 'Regenerando' : 'Generando';
    this._busy = structure.id;
    this._log = [];
    this._renderProject();
    this._showProgress(`${verbo} ${structure.label}…`);

    /** @type {{ok:boolean,error?:string}} */
    let res;
    try {
      res = await api.agent.generate(this._project.path, {
        id: structure.id,
        skill: structure.skill,
        file: structure.file,
        label: structure.label,
        numero: structure.numero,
      });
    } catch (err) {
      // Si la llamada IPC se rechaza, NO dejar _busy atascado (causa de que
      // "Regenerar" dejara de responder tras un fallo).
      res = { ok: false, error: (err && err.message) || 'Error inesperado del agente.' };
    } finally {
      this._busy = null;
      this._hideProgress();
    }

    if (res.ok) {
      // Reabrir para recalcular estados y FLAGS
      const reopened = await api.project.open(this._project.path);
      if (reopened.ok) this._project = reopened.data;
      this._renderProject();
      showToast(`${structure.label} ${wasGenerated ? 'regenerada' : 'generada'}`, 'success');
      // Abrir automáticamente el HTML generado en el editor
      this._openGenerated(structure);
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
    const res = await projectApi().agent.setToken('claude', token);
    if (res.ok) {
      this._agentStatus = res.data;
      this._renderProject();
      showToast('Cuenta de Claude conectada', 'success');
    } else {
      showToast(res.error || 'No se pudo guardar el token', 'error');
    }
  }

  /** @private */
  async _disconnect() {
    const res = await projectApi().agent.clearToken(this._agentStatus.selected);
    if (res.ok) {
      this._agentStatus = res.data;
      this._renderProject();
      showToast('Token olvidado', 'info');
    }
  }

  /** Configura el comando de un agente CLI (Antigravity). @private */
  async _commandDialog() {
    const current = this._selectedAgent();
    const command = await this._askText({
      title: `Comando de ${current.label}`,
      label: 'Comando del CLI',
      placeholder: 'antigravity',
      confirmLabel: 'Guardar',
      hint: 'Comando que la app ejecutará en la carpeta del curso para generar la ' +
        'estructura. La instrucción se envía por la entrada estándar; si tu CLI la ' +
        'espera como argumento, incluye el token {prompt} donde deba ir. Ejemplos: ' +
        '«antigravity» · «antigravity run» · «antigravity agent --prompt {prompt}».',
    });
    if (!command) return;
    const res = await projectApi().agent.setCommand(current.id, command);
    if (res.ok) {
      this._agentStatus = res.data;
      this._renderProject();
      showToast('Comando actualizado', 'success');
    } else {
      showToast(res.error || 'No se pudo guardar el comando', 'error');
    }
  }

  /** Permite al usuario especificar un modelo personalizado. @private */
  async _customModelDialog() {
    const current = this._selectedAgent();
    const model = await this._askText({
      title: 'Especificar modelo personalizado',
      label: 'Nombre del modelo en la API / CLI',
      placeholder: current.id === 'claude' ? 'claude-sonnet-4-6' : 'gemini-2.5-flash',
      confirmLabel: 'Guardar',
      hint: 'Introduce el identificador exacto del modelo. Por ejemplo, ' +
        (current.id === 'claude'
          ? '«claude-sonnet-4-6» o «claude-haiku-4-5».'
          : '«gemini-2.5-flash» o «gemini-2.5-pro».')
    });
    if (!model) {
      this._renderProject();
      return;
    }
    const res = await projectApi().agent.setModel(current.id, model);
    if (res.ok) {
      this._agentStatus = res.data;
      this._renderProject();
      showToast('Modelo personalizado guardado', 'success');
    } else {
      showToast(res.error || 'No se pudo guardar el modelo', 'error');
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

    // Línea de actividad actual (lo más visible: "qué está haciendo ahora")
    const activity = this._el.querySelector('#geo-course-progress-activity');
    if (activity) {
      activity.textContent = ev.message;
      activity.className = `course__progress-activity course__progress-activity--${ev.type}`;
    }

    // Registro completo (desplegable)
    const log = this._el.querySelector('#geo-course-progress-log');
    if (log) {
      const line = document.createElement('div');
      line.className = `course__progress-line course__progress-line--${ev.type}`;
      line.textContent = ev.message;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
  }

  /** @private Formatea segundos como m:ss. @param {number} secs */
  _fmtElapsed(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** @private @param {string} title */
  _showProgress(title) {
    const box = this._el.querySelector('#geo-course-progress');
    if (!box) return;
    box.classList.remove('hidden');
    this._el.querySelector('#geo-course-progress-title').textContent = title;
    const activity = this._el.querySelector('#geo-course-progress-activity');
    if (activity) {
      activity.textContent = 'Iniciando…';
      activity.className = 'course__progress-activity';
    }
    this._el.querySelector('#geo-course-progress-log').innerHTML = '';

    // Cronómetro: prueba de vida con modelos lentos.
    this._progressStart = Date.now();
    const timerEl = this._el.querySelector('#geo-course-progress-timer');
    if (timerEl) timerEl.textContent = '0:00';
    clearInterval(this._progressTimer);
    this._progressTimer = setInterval(() => {
      const el = this._el.querySelector('#geo-course-progress-timer');
      if (!el) return;
      el.textContent = this._fmtElapsed(Math.floor((Date.now() - this._progressStart) / 1000));
    }, 1000);
  }

  /** @private */
  _hideProgress() {
    clearInterval(this._progressTimer);
    this._progressTimer = null;
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
