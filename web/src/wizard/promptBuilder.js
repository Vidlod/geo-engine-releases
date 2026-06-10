/**
 * @fileoverview Composición del prompt final para la IA.
 *
 * Toma el prompt genérico de la sección elegida (importado directamente
 * desde skills/generic/ — fuente única, sin copias) y le anexa los
 * insumos de esta solicitud: sección, archivos RED y documentos convertidos.
 *
 * @module wizard/promptBuilder
 */

import { ENGINE_LABELS } from './convertApi.js';

/*
 * Vite resuelve este glob en build: cada genérico queda embebido como string.
 * Si mañana se agrega skills/generic/geo-glosario-prompt.md, la sección
 * Glosario se habilita sola al recompilar — sin tocar este código.
 */
const GENERIC_MODULES = import.meta.glob(
  '../../../skills/generic/*-prompt.md',
  { query: '?raw', import: 'default', eager: true }
);

/** @param {string} file p.ej. 'geo-momento-prompt.md' */
function genericFor(file) {
  const key = Object.keys(GENERIC_MODULES).find((k) => k.endsWith('/' + file));
  return key ? /** @type {string} */ (GENERIC_MODULES[key]) : null;
}

/**
 * Secciones disponibles en el paso 3 del asistente.
 * `available` se calcula según exista el genérico correspondiente.
 */
export const SECTIONS = [
  {
    id: 'momento',
    label: 'Momento Evaluativo',
    desc: 'Resumen de entregas, semanas, avances y botones de envío.',
    file: 'geo-momento-prompt.md',
    hasNumber: true,
  },
  {
    id: 'entregable',
    label: 'Contenido de Entregables',
    desc: 'Instrucciones del entregable con sus recursos y RED.',
    file: 'geo-entregable-prompt.md',
    hasNumber: true,
  },
  {
    id: 'glosario',
    label: 'Glosario',
    desc: 'Términos del curso en acordeón A–Z.',
    file: 'geo-glosario-prompt.md',
    hasNumber: false,
  },
  {
    id: 'introduccion',
    label: 'Introducción al curso',
    desc: 'Bienvenida, mapa del curso y recursos de arranque.',
    file: 'geo-introduccion-prompt.md',
    hasNumber: false,
  },
].map((s) => ({ ...s, available: genericFor(s.file) !== null }));

/**
 * @typedef {Object} PromptInputs
 * @property {typeof SECTIONS[number]} section
 * @property {number|null} number       — N del momento/entregable (si aplica)
 * @property {string[]} redFiles        — nombres de archivo RED
 * @property {import('./convertApi.js').ConvertResult[]} docs
 */

/* ── Bloques compartidos entre prompt único y prompt por partes ── */

/** @param {PromptInputs} i */
function targetOf({ section, number }) {
  return section.hasNumber && number ? `${section.label} ${number}` : section.label;
}

/** @param {string[]} redFiles */
function redBlock(redFiles) {
  if (redFiles.length > 0) {
    return (
      '### Archivos RED del curso\n' +
      'Estos son los ÚNICOS archivos que existen. En los enlaces ' +
      '`@@PLUGINFILE@@/...` usa EXACTAMENTE estos nombres (byte a byte, ' +
      'con su extensión). Si un recurso mencionado en el documento no está ' +
      'en esta lista, NO inventes el nombre: usa FLAG `red-sin-archivo`.\n\n' +
      redFiles.map((f) => `- \`${f}\``).join('\n') + '\n'
    );
  }
  return (
    '### Archivos RED del curso\n' +
    'No se suministraron archivos RED. Si el documento menciona algún RED, ' +
    'escribe su título en negrita SIN enlace y deja FLAG `red-sin-archivo`.\n'
  );
}

/**
 * @param {number} docCount
 * @param {number} redCount
 * @param {string} target
 */
function controlLine(docCount, redCount, target) {
  return (
    'Comienza tu respuesta SIEMPRE con esta línea de control antes del HTML, ' +
    'con los valores reales que leíste:\n\n' +
    '`INSUMOS RECIBIDOS: ' + docCount + ' documento(s) fuente · ' +
    redCount + ' archivo(s) RED · Sección: ' + target + '`\n\n' +
    'Esa línea le permite al usuario detectar de inmediato si algo se perdió.\n'
  );
}

/**
 * Parte el contenido de un documento en trozos de máximo `max` caracteres,
 * cortando SIEMPRE en límites de párrafo (\n\n) para no romper bloques.
 * @param {string} content
 * @param {number} max
 * @returns {string[]}
 */
function splitContent(content, max) {
  if (content.length <= max) return [content];
  const out = [];
  let current = '';
  for (const para of content.split('\n\n')) {
    const piece = current ? current + '\n\n' + para : para;
    if (piece.length > max && current) {
      out.push(current);
      current = para;
    } else if (para.length > max && !current) {
      // párrafo gigante (tabla enorme): corte duro como último recurso
      for (let i = 0; i < para.length; i += max) out.push(para.slice(i, i + max));
      current = '';
    } else {
      current = piece;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Tamaño máximo por mensaje en el modo "por partes". */
export const PART_MAX = 28000;

/**
 * Construye el prompt completo listo para pegar en la IA.
 * @param {PromptInputs} inputs
 * @returns {string}
 */
export function buildPrompt({ section, number, redFiles, docs }) {
  const generic = genericFor(section.file);
  if (!generic) {
    throw new Error(`No existe el genérico ${section.file} en skills/generic/`);
  }

  const parts = [generic.trim()];

  parts.push(
    '\n---\n\n## ═══ INSUMOS DE ESTA SOLICITUD ═══\n\n' +
    'Esta sección REEMPLAZA los pasos de "CÓMO USAR ESTE PROMPT": no esperes ' +
    'adjuntos. Los documentos fuente ya vienen incluidos abajo, la lista de ' +
    'archivos RED equivale al MAPA DE ARCHIVOS, y la sección a generar ya está ' +
    'indicada. Trabaja únicamente con lo que aparece a continuación.\n'
  );

  // ── Sección ──
  const target = targetOf({ section, number });
  parts.push(`### Sección a generar\n${target}\n`);

  // ── Archivos RED ──
  parts.push(redBlock(redFiles));

  // ── Documentos fuente ──
  docs.forEach((doc, i) => {
    const fence = doc.format === 'html' ? 'html' : 'markdown';
    parts.push(
      `### Documento fuente ${i + 1}: ${doc.filename} ` +
      `(convertido con ${ENGINE_LABELS[doc.engine] || doc.engine})\n\n` +
      'La regla de TRASPLANTE 1:1 de la Parte 1 aplica sobre este documento: ' +
      'cada párrafo de la fuente = un `<p>` en la salida.\n\n' +
      '````' + fence + '\n' + doc.content.trim() + '\n````\n'
    );
  });

  // ── Centinela de integridad ──
  // Va de último a propósito: si la UI truncó el pegado, esta sección no llega
  // y la IA debe frenar en lugar de generar con insumos incompletos.
  parts.push(
    '---\n\n' +
    '## ═══ VERIFICACIÓN DE INTEGRIDAD (ÚLTIMA SECCIÓN DEL PROMPT) ═══\n\n' +
    'Este prompt termina aquí, después de los documentos fuente. Si no ves esta ' +
    'sección completa o algún documento aparece cortado a mitad de frase, el ' +
    'texto llegó TRUNCADO (o tu lector de adjuntos solo te muestra fragmentos): ' +
    'NO generes nada. Si tienes herramientas para leer archivos, lee el archivo ' +
    'COMPLETO de principio a fin; si no, pide al usuario que reenvíe el prompt ' +
    'con la opción «Copiar por partes» del asistente.\n\n' +
    'Si llegó completo, ' +
    controlLine(docs.length, redFiles.length, target)
  );

  return parts.join('\n');
}

/**
 * Construye el prompt como una secuencia de mensajes de tamaño seguro
 * (≤ PART_MAX caracteres) para UIs que truncan pegados largos o que no
 * inyectan los adjuntos completos al contexto (p. ej. ChatGPT).
 *
 * Estructura: [1] reglas + esqueleto · [2..k] documentos (fragmentados en
 * límites de párrafo) · [N] insumos finales + orden de generar.
 *
 * @param {PromptInputs} inputs
 * @returns {string[]} mensajes listos para enviar en orden
 */
export function buildPromptParts({ section, number, redFiles, docs }) {
  const generic = genericFor(section.file);
  if (!generic) {
    throw new Error(`No existe el genérico ${section.file} en skills/generic/`);
  }

  const target = targetOf({ section, number });

  // Fragmentar cada documento por adelantado para conocer el total de partes.
  const docChunks = docs.map((doc) => splitContent(doc.content.trim(), PART_MAX));
  const total = 1 + docChunks.reduce((n, c) => n + c.length, 0) + 1;

  const holdNote = (i) =>
    `> **PARTE ${i}/${total} — NO GENERES TODAVÍA.** Guarda este contenido en tu ` +
    'contexto y responde únicamente: «Parte ' + i + '/' + total + ' recibida». ' +
    'El HTML se genera solo cuando llegue la parte final, que dice GENERA AHORA.\n';

  const messages = [];

  // ── Parte 1: reglas + esqueleto (el genérico viaja entero, nunca se parte) ──
  messages.push(
    `# ENVÍO EN PARTES — PARTE 1/${total}\n\n` +
    'Te enviaré un encargo de maquetación dividido en ' + total + ' mensajes ' +
    'porque el material es extenso. ' + '\n\n' + holdNote(1) + '\n---\n\n' +
    generic.trim()
  );

  // ── Partes 2..k: documentos fuente ──
  let pi = 2;
  docs.forEach((doc, di) => {
    const chunks = docChunks[di];
    const fence = doc.format === 'html' ? 'html' : 'markdown';
    chunks.forEach((chunk, ci) => {
      const frag = chunks.length > 1 ? ` (fragmento ${ci + 1}/${chunks.length})` : '';
      messages.push(
        `# PARTE ${pi}/${total} — Documento fuente ${di + 1}: ${doc.filename}${frag}\n\n` +
        `Convertido con ${ENGINE_LABELS[doc.engine] || doc.engine}. ` +
        (chunks.length > 1
          ? 'Une los fragmentos de este documento EN ORDEN y sin alterar nada; ' +
            'juntos son el documento completo.\n\n'
          : '\n\n') +
        holdNote(pi) + '\n' +
        '````' + fence + '\n' + chunk + '\n````\n'
      );
      pi++;
    });
  });

  // ── Parte final: insumos + orden de generar ──
  messages.push(
    `# PARTE ${total}/${total} — INSUMOS FINALES · GENERA AHORA\n\n` +
    'Ya recibiste el 100% del material: las reglas con su esqueleto (parte 1) ' +
    'y los documentos fuente completos (partes intermedias). No esperes más adjuntos.\n\n' +
    `### Sección a generar\n${target}\n\n` +
    redBlock(redFiles) + '\n' +
    'La regla de TRASPLANTE 1:1 de la Parte 1 del genérico aplica sobre los ' +
    'documentos recibidos: cada párrafo de la fuente = un `<p>` en la salida.\n\n' +
    controlLine(docs.length, redFiles.length, target) + '\n' +
    `**GENERA AHORA** el HTML completo de: ${target}.\n`
  );

  return messages;
}

/**
 * Estimación burda de tokens (≈ 4 caracteres por token).
 * @param {string} text
 */
export function estimateTokens(text) {
  return Math.round(text.length / 4);
}
