---
name: geo-introduccion
description: >-
  Usar al crear o corregir la página HTML de Introducción al curso de un curso en
  Moodle (proyecto GEO / UDES) a partir de la AAA y las Instrucciones Generales.
  Cubre las 7 pestañas (Introducción con Resultado de Aprendizaje y Dimensiones,
  Detalles del Curso, Justificación, Problemas, Temas a Trabajar, Palabras Claves y
  Resumen de Entregas) y la barra de botones Instrucciones/Syllabus/Rúbricas/Glosario.
---

# Skill: Maquetación de la Introducción al curso (GEO)

Genera el HTML de la página de presentación del curso: navegación vertical de pestañas
+ contenido de cada pestaña, más la barra de botones "Información del Curso".

## Antes de empezar: lee las reglas transversales

Lee `references/reglas-transversales.md` (regla de oro, FLAGS, enlaces y linter).
El esqueleto completo con placeholders está en `examples/skeleton.html`.

## Insumos

> **Insumo principal: la AAA del curso (.docx).** En el flujo de la app este
> segmento se construye SOLO con la AAA + `curso.yaml`; no leas otros archivos
> de `insumos/` salvo que la instrucción los liste explícitamente.

- La **AAA del curso** (Resultado de Aprendizaje, dimensiones, créditos/horas,
  unidades y temas, palabras clave, tabla de Resumen de Entregas).
- Las **Instrucciones Generales** del curso.
- El **MAPA DE ARCHIVOS**: imagen de portada, Instrucciones, Syllabus, Rúbricas y el
  ID del Glosario de Moodle.

## Estructura (dos piezas, se entregan por separado)

**A. La página** — `nav-pills` vertical (`col-md-3`) + `tab-content` (`col-md-9`) con
7 pestañas EN ORDEN:

1. **INTRODUCCIÓN** — `<h3 class="h5">Resultado de Aprendizaje</h3>` + `<p>`, luego
   `<h3 class="h5">Dimensiones…</h3>` + `<ul>` de 3 dimensiones (Actitudinal/Cognitiva/
   Procedimental) en `<strong>` dentro de `<div align="justify">`. A la derecha, la
   imagen de portada con `@@PLUGINFILE@@`.
2. **DETALLES DEL CURSO** — tabla créditos / horas / duración / total.
3. **JUSTIFICACIÓN** — `<h4>` + texto de la AAA (1:1 por párrafo).
4. **PROBLEMAS QUE SE ABORDARÁN EN EL CURSO** — `<h4>` + texto de la AAA.
5. **TEMAS A TRABAJAR EN EL CURSO** — una unidad por bloque (`<p><strong>Unidad N…`
   + `<ul>` de temas), con `<br>` entre unidades.
6. **PALABRAS CLAVES** — lista corta.
7. **RESUMEN DE ENTREGAS** — tabla con `rowspan` (igual que el Momento); el último
   avance se nombra **"Producto Final"**.

**B. La barra de botones** — fila de 4: Instrucciones Generales (`fa-calculator`,
azul), Syllabus (`fa-file-text-o`, verde), Rúbricas (`fa-folder-open-o`, rojo) y
Glosario (`fa-sort-alpha-asc`, ámbar). Archivos locales con `@@PLUGINFILE@@`; el
Glosario enlaza a `mod/glossary/view.php?id=XXXX`.

## Reglas de criterio / formato

1. **Trasplante 1:1** del texto de la AAA: un párrafo de la fuente = un `<p>`. No
   parafrasees ni fusiones.
2. **Espaciado** (reglas GEO):
   - Dimensiones del RA → texto pesado → `</li><br><li>` entre viñetas.
   - "Temas a trabajar" → `</ul><br><p>` entre unidades (única transición con `<br>`).
   - Palabras clave y temas → viñetas cortas, **sin** `<br>`.
   - Nunca `margin` inline ni `<br><br>`.
3. **Enlaces**: `@@PLUGINFILE@@` para archivos locales (jamás `draftfile.php` ni
   OneDrive); `target="_blank" rel="noopener"`.
4. **No dupliques títulos**: los `<h4 class="mb-4">` de cada pestaña son del esqueleto;
   no agregues un título extra de página.
5. **No cambies** `class` / `id` / `role` / `aria-*` / `data-toggle` del esqueleto.

## Flags típicos

- `dato-faltante` — créditos, horas, ID del glosario sin conocer.
- `red-sin-archivo` — botón (Syllabus/Rúbricas/Instrucciones) sin archivo conocido.
- `imagen-faltante` — no se conoce el archivo de la imagen de portada.
- `enlace-roto` — enlace de glosario caído o incorrecto.

## Hecho cuando

- [ ] 7 pestañas en orden, con sus `<h4 class="mb-4">` y contenido de la AAA.
- [ ] Resultado de Aprendizaje + 3 dimensiones con `</li><br><li>`.
- [ ] "Temas a trabajar" con `</ul><br><p>` entre unidades; listas cortas sin `<br>`.
- [ ] Tabla de Resumen de Entregas con `rowspan` y "Producto Final" en el último avance.
- [ ] Barra de 4 botones con `@@PLUGINFILE@@` y el glosario enlazado.
- [ ] Imagen de portada con `@@PLUGINFILE@@` (no `draftfile.php`).
- [ ] `python cli.py check` sin errores.
- [ ] Lista de FLAGS entregada.
