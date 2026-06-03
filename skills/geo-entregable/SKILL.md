---
name: geo-entregable
description: >-
  Usar al crear o corregir una página HTML de Entregable o Avance para un curso
  en Moodle (proyecto GEO / UDES) a partir de documentos Word o PDF. Cubre la
  estructura de dos pestañas (Forma de entrega / Tenga en cuenta), la regla
  "Documento:", el subtítulo desde la AAA y la nomenclatura "Producto Final".
---

# Skill: Maquetación de Entregables (GEO)

Genera o corrige el HTML de un **Entregable / Avance** listo para Moodle, siguiendo
las reglas del proyecto al pie de la letra.

## Antes de empezar: lee las reglas transversales

Lee `references/reglas-transversales.md` (regla de oro, FLAGS, @@PLUGINFILE@@, REDs,
citas, "Producto Final" y uso del linter). Aplican a esta estructura.

## Insumos que necesitas

- El **PDF/Word del entregable** correspondiente (su contenido exacto).
- La **AAA** del curso (tabla "Nombre del entregable" → da el subtítulo).
- La **rúbrica** asociada al momento (para el enlace de evaluación).
- La **plantilla HTML** del entregable (estructura visual correcta).

Si falta alguno, emite un FLAG `dato-faltante` y continúa con lo disponible.

## Estructura objetivo

1. **Título** `<h3>` del entregable (Avance N o Producto Final).
2. **Subtítulo** `<h5>` con la descripción tomada de la AAA, columna "Nombre del
   entregable":
   `<h5>Tipo de entregable: <span style="">Descripción...</span></h5><br>`
   No dupliques esta descripción dentro de "Forma de entrega".
3. Dos pestañas:
   - **"Forma de entrega"** (corrige si la plantilla dice "Formato de entrega").
   - **"Tenga en cuenta"**.

## Procedimiento

1. **Regla "Documento:"** (decisión de criterio):
   - Si el PDF inicia el entregable con la palabra `Documento.` / `Documento:` →
     mantén la cabecera `<h5>Documento: ...</h5>` arriba de las pestañas.
   - Si **no** aparece esa palabra → NO pongas la cabecera; toma ese primer párrafo
     y colócalo como primer párrafo dentro de **"Forma de entrega"**.
   - Si no logras determinarlo con el PDF, emite FLAG `ubicacion`.
2. **Volcado de contenido:** copia el texto del PDF respetando puntuación y párrafos
   originales (no parafrasees). Reparte entre "Forma de entrega" y "Tenga en cuenta"
   según la plantilla.
3. **Párrafo de envío:** el que indica la acción de entregar (p. ej. "Envíe el
   documento en formato PDF...") va como **último** párrafo de la pestaña, justo
   encima del botón de envío. Otros párrafos descriptivos van arriba.
4. **Anexos / RED / citas:** formatéalos según `references/reglas-transversales.md`.
5. **Frase de la plantilla** "Desarrolle el entregable siguiendo las indicaciones del
   formato suministrado..." solo se incluye si está en el PDF de ESE entregable.
6. **Producto Final:** si es el último avance, aplica la nomenclatura global
   (ver reglas transversales, sección 7).
7. **Valida con el linter** (sección 8 de las reglas transversales): `fix --write` y
   luego `check`.

## Flags típicos de esta estructura

- `ubicacion`: no se distingue si el primer párrafo va en cabecera "Documento" o en
  "Forma de entrega".
- `dato-faltante`: falta el enlace de Moodle del botón de envío, o la rúbrica.
- `red-sin-archivo`: un RED mencionado no tiene archivo disponible.

## Hecho cuando

- [ ] `<h3>` + `<h5>` (desde AAA) presentes y sin duplicar la descripción.
- [ ] Pestañas "Forma de entrega" / "Tenga en cuenta" correctas.
- [ ] Regla "Documento:" resuelta (o con FLAG).
- [ ] Párrafo de envío al final, encima del botón.
- [ ] Enlaces con `@@PLUGINFILE@@`, RED en viñetas, citas con formato.
- [ ] `python cli.py check` sin errores (warnings revisados).
- [ ] Lista de FLAGS entregada al usuario.
