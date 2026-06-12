---
name: geo-linea-tiempo
description: >-
  Usar al crear o corregir la página HTML de la Línea del Tiempo (timeline) de un
  curso en Moodle (proyecto GEO / UDES). Cubre los títulos simplificados "Avance N",
  los enlaces de cada hito al entregable correspondiente, la nomenclatura "Producto
  Final" y la eliminación de la línea "CIERRE DE CURSO".
---

# Skill: Maquetación de la Línea del Tiempo (GEO)

Corrige o genera el HTML de la **línea del tiempo** del curso: una secuencia de hitos
(uno por avance) donde cada título enlaza al entregable correspondiente.

## Antes de empezar: lee las reglas transversales

Lee `references/reglas-transversales.md` (regla de oro, FLAGS, enlaces y linter).

## Insumos

> **Insumo principal: la AAA del curso (.docx).** En el flujo de la app este
> segmento se construye SOLO con la AAA + `curso.yaml`; no leas otros archivos
> de `insumos/` salvo que la instrucción los liste explícitamente.

- El número de **avances** del curso (de la AAA).
- El **enlace de destino** de cada avance (en los cursos actuales apunta a la tarea de
  Moodle `mod/assign/view.php?id=...` del avance).
- La **plantilla HTML** de la línea del tiempo.

## Reglas (estrictas)

1. **Títulos simplificados**: cada hito se titula EXCLUSIVAMENTE `Avance N`, sin
   subtítulos ni descripciones.
   - Correcto: `Avance 1`, `Avance 2`, `Avance 3`, `Avance 4`.
   - Incorrecto: `Avance 1. Documento`, `Avance 4. Vídeo creativo`.
2. **Producto Final**: el último avance se titula `Producto Final`, tanto en el texto
   visible como en el atributo `title` del enlace. Prohibido `Avance 5`.
3. **Enlaces — mismo destino que los botones de envío de los Momentos**: cada título
   apunta **exactamente al mismo URL** que el botón de envío de ese avance en su Momento
   (la tarea `mod/assign/view.php?id=...`). Es la fuente única: si cambia el botón, cambia
   el timeline. Cada enlace abre en pestaña nueva (`target="_blank" rel="noopener"`) y su
   `title` coincide con el texto visible.
   ```html
   <h6><a href="https://virtual.udes.edu.co/mod/assign/view.php?id=XXXX" target="_blank" rel="noopener" title="Avance 1">Avance 1</a></h6>
   ```
   Los URLs por avance pueden tomarse de `config/course.yaml` (`moodle_assign`).
4. **Eliminar "CIERRE DE CURSO"**: borra esa línea/hito por completo; no corresponde.

## Flags típicos

- `dato-faltante`: no se conoce el URL de un avance (no está en `course.yaml` ni en el
  Momento). NO inventes la URL; emite FLAG y deja el título con un marcador para que el
  usuario lo complete.

## Hecho cuando

- [ ] Un hito por avance, títulos solo "Avance N" (sin subtítulos).
- [ ] Último avance como "Producto Final" (texto y `title`).
- [ ] Cada título enlazado, en pestaña nueva, `title` == texto.
- [ ] Línea "CIERRE DE CURSO" eliminada.
- [ ] `python cli.py check` sin errores; FLAGS entregados.
