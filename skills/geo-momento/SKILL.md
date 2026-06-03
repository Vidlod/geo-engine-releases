---
name: geo-momento
description: >-
  Usar al crear o corregir una página HTML de un Momento Evaluativo para un curso
  en Moodle (proyecto GEO / UDES) a partir de la AAA y los PDF del curso. Cubre la
  tabla de Resumen de Entregas con fusión rowspan, las pestañas de contenido por
  rango de semanas, los botones de envío, la pestaña "Instrumento para Enviar
  Entregable" y la nomenclatura "Producto Final".
---

# Skill: Maquetación de Momentos Evaluativos (GEO)

Genera o corrige el HTML de un **Momento Evaluativo** (bloque que agrupa varios
avances con sus semanas, recursos y entregas) listo para Moodle.

## Antes de empezar: lee las reglas transversales

Lee `references/reglas-transversales.md` (regla de oro, FLAGS, @@PLUGINFILE@@, REDs,
citas, "Producto Final" y uso del linter).

## Insumos

- La **AAA** del curso: tabla de resumen (avances, cuestionarios, semanas, pesos) y el
  contenido por semana/actividad.
- Los **PDF de los entregables** del momento y la **rúbrica** del momento.
- La lista de **RED por actividad** (mapas, infografías, presentaciones, podcasts...).
- **Enlaces de Moodle** `mod/assign/view.php?id=...` por entregable.
- La lista de **videos** (YouTube) por semana, si el curso los incluye.

> ⚠️ Las **semanas y el número de avances dependen del curso**: tómalos SIEMPRE de la
> AAA del curso actual. No uses números fijos de otros cursos (ver "Contexto a confirmar").

## Estructura objetivo

1. **Resumen de Entregas** (tabla): por cada periodo, el Avance y su Cuestionario.
   - **Fusión rowspan**: las columnas "Duración Semana" y "Semana de Entrega" que
     comparten avance + cuestionario se fusionan con `rowspan="2"` (o el nº de filas).
     No repitas la misma semana en filas separadas.
   - **Negrita solo en el nombre del avance**, NO en toda la celda:
     `<strong>Avance 1. Recolección de datos:</strong> Informe con la elaboración...`
     (el nombre con dos puntos `:` en negrita; la descripción en texto normal).
     La fila del cuestionario sí va completa en `<strong>`.
2. **Pestañas de contenido: una pestaña por SEMANA individual.** Cada semana tiene su
   propia pestaña, con el nombre de la semana y el número de su Avance en el subtítulo,
   p. ej. `Semana 1 / Avance 1`, `Semana 2 / Avance 1`, `Semana 3 / Avance 1`,
   `Semana 4 / Avance 2`, `Semana 5 / Avance 2`. El número total de pestañas = total
   de semanas del momento (tomado de la AAA). No fusiones ni agrupes.
3. **Botón de envío** centrado al final de la **última semana de cada avance**
   (formato estándar de Moodle, con `mod/assign/view.php?id=...`).
4. **Pestaña "Instrumento para Enviar Entregable"**: tantos botones como avances tenga
   el momento (p. ej. Momento con 3 avances → 3 botones).

## Reglas de criterio / formato

1. **Producto Final**: el último avance del último momento pasa a "Producto Final" de
   forma global (tabla, pestañas, botones, textos, `title`). Donde diga "Avance N" (el
   último, según `config/course.yaml` → `last_avance`) se reemplaza por "Producto Final".
2. **Botones de envío — texto con punto final SIEMPRE**: `Enviar Avance 1.`,
   `Enviar Producto Final.` (todos terminan en punto).
3. **Botones de envío — ubicación**: uno al final de la **última semana de cada avance**,
   según los rangos de la AAA del curso. Ejemplo (Estadística): semanas 3 / 5 / 7 / 9 / 12
   (Avance 1: 1-3, Avance 2: 4-5, Avance 3: 6-7, Avance 4: 8-9, Producto Final: 10-12).
   Los rangos varían por curso → tómalos de `config/course.yaml` o de la AAA.
4. **No duplicar recursos**: cada recurso bibliográfico/RED se lista UNA vez, debajo de
   la actividad que lo usa. Prohibido repetir una lista general al final de la semana.
5. **Listas de texto numeradas** (ejercicios, preguntas `1) 2)` o `a. b.`): separa cada
   ítem con `<br><br>` (sin superar 2 saltos). Si llevan negrita, el marcador va DENTRO
   del `<strong>` de forma consistente en todos los ítems (`<strong>a. Título.</strong>`).
6. **Párrafo de envío** al final de la pestaña, encima del botón.
7. **Videos y diapositivas en video = RED** (ver reglas transversales §4). Varían por curso
   y suelen ser lo último en colocarse. Si no tienes las URLs, emite FLAG `dato-faltante`
   indicando **cuáles son y en qué semana/actividad van**; no inventes videos.
8. Volcado de contenido **respetando puntuación y párrafos originales**; no parafrasear.

## Flags típicos

- `dato-faltante`: faltan enlaces `mod/assign` de los botones, o la lista de videos.
- `red-sin-archivo`: un RED mencionado no tiene archivo/enlace.
- `podcast-titulo`: hay un podcast → verificar título por escucha.

## Hecho cuando

- [ ] Tabla de Resumen con fusión `rowspan` correcta (avance + cuestionario).
- [ ] Una pestaña por semana individual, con nombre `Semana N` y subtítulo `Avance N`.
- [ ] Botón de envío en la última semana de cada avance; texto con punto final.
- [ ] Pestaña "Instrumento para Enviar Entregable" con el nº correcto de botones.
- [ ] Producto Final aplicado globalmente; recursos sin duplicar.
- [ ] Videos/diapositivas tratados como RED (o FLAG si faltan).
- [ ] `python cli.py check` sin errores; FLAGS entregados.
