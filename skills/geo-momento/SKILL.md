---
name: geo-momento
description: >-
  Usar al crear o corregir una página HTML de un Momento Evaluativo para un curso
  en Moodle (proyecto GEO / UDES) a partir de la AAA y los PDF del curso. Cubre la
  tabla de Resumen de Entregas con fusión rowspan, las pestañas de contenido (una
  por semana individual), los botones de envío, la pestaña "Instrumento para Enviar
  Entregable" y la nomenclatura "Producto Final".
---

# Skill: Maquetación de Momentos Evaluativos (GEO)

Genera o corrige el HTML de un **Momento Evaluativo** (bloque que agrupa varios
avances con sus semanas, recursos y entregas) listo para Moodle.

## Antes de empezar: lee las reglas transversales

Lee `references/reglas-transversales.md` (regla de oro, FLAGS, @@PLUGINFILE@@, REDs,
citas, "Producto Final" y uso del linter).

## Insumos

> **Insumo principal: la AAA del curso (.docx).** En el flujo de la app este
> segmento se construye SOLO con la AAA + `curso.yaml`; no leas otros archivos
> de `insumos/` (rúbricas, PDFs de entregables…) salvo que la instrucción los
> liste explícitamente.

- La **AAA** del curso: tabla de resumen (avances, cuestionarios, semanas, pesos) y el
  contenido por semana/actividad.
- Los **PDF de los entregables** del momento y la **rúbrica** del momento.
- La lista de **RED por actividad** (mapas, infografías, presentaciones, podcasts...).
- **Enlaces de Moodle** `mod/assign/view.php?id=...` por entregable.
- La lista de **videos** (YouTube) por semana, si el curso los incluye.

> ⚠️ Las **semanas y el número de avances dependen del curso**: tómalos SIEMPRE de la
> AAA del curso actual. No uses números fijos de otros cursos (ver "Contexto a confirmar").

## Estructura objetivo

1. **Resumen de Entregas** (tabla): las filas son **exactamente** las de la tabla
   resumen de la AAA. **Prohibido inventar filas**: si la AAA solo lista avances,
   NO se agregan filas de "Cuestionario de evaluación" (ni con peso 0%).
   - **Caso A (solo avances)**: una fila por avance, SIN `rowspan` en "Duración
     Semana" / "Semana de Entrega"; el único `rowspan` es el de la columna del
     Momento (= nº de avances).
   - **Caso B (avance + cuestionario en la AAA)**: dos filas por avance; "Duración
     Semana" y "Semana de Entrega" se fusionan con `rowspan="2"`. No repitas la
     misma semana en filas separadas.
   - **La negrita de esta tabla es un ESPEJO EXACTO del AAA — no la inventes ni la
     extiendas.** El AAA pone en negrita SOLO la etiqueta del entregable
     (`<strong>Avance 1</strong>`, `<strong>Producto final.</strong>`) o la del
     cuestionario hasta su guion (`<strong>Cuestionario de evaluación –</strong>`).
     El nombre del entregable y toda su descripción van en **texto normal**. La fila
     del cuestionario **NO** va completa en negrita: solo su etiqueta.
     - ✅ `<strong>Avance 1.</strong> Recolección de datos - Informe con la elaboración...`
     - ✅ `<strong>Cuestionario de evaluación –</strong> Unidad 1 - Investigación estadística`
     - ❌ `<strong>Avance 1. Recolección de datos:</strong> Informe...` (negrita extendida
       al nombre del entregable + dos puntos inventados que el AAA no trae)
     - ❌ `<strong>Cuestionario de evaluación - Unidad 2 – Fundamentos de Estadística</strong>`
       (toda la celda en negrita)
     - Respeta el separador del AAA (`–`/`-`): no lo cambies por `:`. Si el AAA escribe
       `<strong>Avance 1</strong>. Recolección...`, puedes mover el punto dentro de la
       negrita (`<strong>Avance 1.</strong>`) pero **nunca** absorber el nombre del entregable.
2. **Pestañas de contenido: una pestaña por SEMANA individual.** Cada semana tiene su
   propia pestaña, con el nombre de la semana y el número de su Avance en el subtítulo,
   p. ej. `Semana 1 / Avance 1`, `Semana 2 / Avance 1`, `Semana 3 / Avance 1`,
   `Semana 4 / Avance 2`, `Semana 5 / Avance 2`. El número total de pestañas = total
   de semanas del momento (tomado de la AAA). No fusiones ni agrupes.
3. **Botón de envío** centrado al final de la **última semana de cada avance**
   (formato estándar de Moodle, con `mod/assign/view.php?id=...`).

   > ⚠️ **REGLA CRÍTICA — ubicación del botón**: La semana donde va el botón se
   > determina EXCLUSIVAMENTE por la tabla de la AAA / `course.yaml`, NO por el
   > esqueleto de ejemplo. El esqueleto muestra solo 4 semanas de muestra; en un
   > curso real el Avance 1 puede abarcar 3, 4, 5 o más semanas. **El botón va en la
   > ÚLTIMA semana del rango del avance.** Ejemplo:
   > - Avance 1: semanas 1-4 → botón en Semana **4** (no en la 3).
   > - Avance 2: semanas 5-7 → botón en Semana **7**.
   > Algoritmo: lee el rango `Duración Semana` de la tabla de resumen para cada
   > avance; el número mayor es la semana donde colocas el botón y el párrafo de
   > envío. **NUNCA copies los números del esqueleto literalmente.**

4. **Pestaña "Instrumento para Enviar Entregable"**: tantos botones como avances tenga
   el momento (p. ej. Momento con 3 avances → 3 botones).
5. **Pestaña "Descripción General" — de QUÉ tabla del AAA sale.** Por cada momento, el
   AAA suele traer **dos** tablas seguidas y hay que elegir bien la fuente:
   - **Tabla de "reporte de avance(s)"** (título tipo *"Primer reporte de avance (1 y 2)
     – 40%"*, de una sola columna): trae el rótulo `Descripción general:`, la **situación
     hipotética**, las condiciones formales (Portada, Introducción…) y enlaces como
     Infostat. ⚠️ **Esta tabla NO alimenta la pestaña** cuando existe la siguiente.
   - **Tabla de "Entregables del avance N…"** (título tipo *"Entregables del avance 1 y 2"*,
     multicolumna, la que precede a las filas `Semana | Secuencia | Recursos Educativos`):
     **ESTA es la fuente de "Descripción General".** Vuelca sus párrafos introductorios
     (`En este [primer/segundo] reporte de avances…`, desarrollo individual/grupal,
     `SABER:`/`SER:`/`HACER:`, `Los N entregables… equivalen al X%…`). La fila
     **"Condiciones particulares de entrega"** se convierte en un `<h4>Condiciones
     Particulares de Entrega</h4>` con su texto, dentro de la misma pestaña.
   - **Regla de selección**: usa SIEMPRE la tabla "Entregables del avance…". Recurre a la
     de "reporte de avance" **solo si la de "Entregables" no existe** en ese momento.
     Los títulos varían por curso → identifícalas por su rol (la multicolumna que precede
     a las semanas es la buena), no por el texto exacto.
   - **No mezcles**: la situación hipotética y las condiciones formales (Portada,
     Introducción, Justificación…) de la tabla de "reporte de avance" **no van** en la
     Descripción General cuando usas la tabla de "Entregables".

## Reglas de criterio / formato

1. **Producto Final**: el último avance del último momento pasa a "Producto Final" de
   forma global (tabla, pestañas, botones, textos, `title`). Donde diga "Avance N" (el
   último, según `config/course.yaml` → `last_avance`) se reemplaza por "Producto Final".
2. **Botones de envío — texto SIN punto final**: semanal `Enviar Entregable N`;
   pestaña Instrumento `Enviar Entregable Avance N`; último avance del último
   momento `Enviar Producto Final` (ninguno lleva punto).
3. **Botones de envío — ubicación**: uno al final de la **última semana de cada avance**,
   según los rangos de la AAA del curso. Ejemplo (Estadística): semanas 3 / 5 / 7 / 9 / 12
   (Avance 1: 1-3, Avance 2: 4-5, Avance 3: 6-7, Avance 4: 8-9, Producto Final: 10-12).
   Los rangos varían por curso → tómalos de `config/course.yaml` o de la AAA.
4. **No duplicar recursos — un RED aparece UNA sola vez** (reglas §12-C): si el AAA lo
   nombra en una frase corrida (syllabus, rúbrica, mapa, infografía, **foro social**…),
   va como **enlace inline** ahí mismo y NO se repite en viñeta abajo. Si el AAA lo
   anuncia aparte (*"…recursos educativos Digitales RED…:"* + título), va en su **viñeta**.
   **Videos y presentaciones SIEMPRE en viñeta abajo** con su caja (iframe/responsiva),
   nunca inline. Prohibido nombrar un recurso inline y además listarlo abajo, o repetir
   una lista general al final de la semana.
5. **Separación entre viñetas** (`</li><br><li>`, un solo `<br>`, nunca `<br><br>`):
   - **Listas NUMERADAS** (`1.`, `2.`, `1)`, `2)` — ejercicios, preguntas
     orientadoras): se **mantienen como `<p>` con su número** (NO se vuelven viñetas
     ni se les quita el número). La negrita es espejo del origen: no añadas `<strong>`
     donde no lo hay. (Las **letras** `a. b. c.` sí se vuelven viñetas → regla 11.)
   - **Citas bibliográficas** y **grupos de RED** (viñetas con mucho texto / enlace):
     un `<br>` entre cada viñeta (los RED **siempre** separados).
   - **Listas cortas de una línea** (Portada/Introducción/Conclusiones): **sin** `<br>`.
   - El `<br>` va **entre** viñetas, nunca antes de `</ul>`/`</ol>` (ver reglas §6).
6. **Párrafo de envío** al final de la pestaña, encima del botón — después de
   secciones adicionales como "Exposiciones orales". Al quitar "tablero de
   anotaciones" **también se elimina la especificación de formato** ("en formato PDF",
   "en formato Word", "en formato Excel", etc.). La frase final es **siempre**:
   `Envíe el documento en las fechas establecidas.`
   Ejemplo: `envíelo en formato PDF a través del tablero de anotaciones en las fechas
   establecidas` → `Envíe el documento en las fechas establecidas.`
7. **Videos y diapositivas en video = RED** (ver reglas transversales §4). Varían por curso
   y suelen ser lo último en colocarse. Si no tienes las URLs, emite FLAG `dato-faltante`
   indicando **cuáles son y en qué semana/actividad van**; no inventes videos.
8. Volcado de contenido **respetando puntuación y párrafos originales**; no parafrasear.
9. **Enumeraciones con guion → `<ul>/<li>`** (reglas §9): nunca dejes `-Portada.` como
   párrafo con guion literal. Sub-preguntas de un ítem → `<ul>` anidada.
10. **Secuencia de lectura** (reglas §16): cada lista va inmediatamente después de su
    párrafo anunciador (el que termina en `:`); no muevas bibliografía/RED al final
    de la pestaña ni dupliques párrafos anunciadores.
11. **Listas con marcador de LETRA** (`a.`, `b.`, `c.`, `a)`, `A.`, `A)`, etc.)
    → `<ul>` con un `<li>` por ítem, **QUITANDO la letra** (la viñeta la reemplaza),
    igual que con los guiones (reglas §9). `a. Realice el diagrama...` →
    `<li>Realice el diagrama...</li>`.
    - **Negrita = espejo del origen.** Si el origen pone en negrita la etiqueta del
      ítem —con la letra dentro (`<strong>b. Medidas de posición:</strong>`) o fuera
      (`a. <strong>Tabla de frecuencia.</strong>`)— consérvala en negrita **sin la
      letra**: `<li><strong>Medidas de posición:</strong> ...</li>`. Si el origen
      **no** trae negrita, **no añadas ninguna**.
    - Aunque el origen sea inconsistente (la `a.` fuera de la negrita y la `b.`/`c.`
      dentro), el resultado queda uniforme: siempre quitas la letra y reflejas la
      negrita que ya existía sobre la etiqueta.
    - Ítems multilínea → un `<br>` entre cada `<li>`; ítems cortos de una línea →
      consecutivos sin `<br>`.
    - **NUNCA** conviertas estos ítems en bloques `<p><strong>` por tu cuenta:
      mantenlos como viñetas reflejando exactamente la negrita del origen.
12. **Correcciones tipográficas obligatorias** (reglas §17): negrita partida a media
    palabra, `¿` faltante, erratas evidentes ("Comprar"→"Comparar") y anglicismos del
    convertidor ("aspects", "explaining"). Repórtalas en lista `CORRECCIONES:` y nunca
    pierdas un `¿` que el origen sí tiene.

## Flags típicos

- `dato-faltante`: faltan enlaces `mod/assign` de los botones, la lista de videos,
  o el enlace de un foro mencionado en el texto.
- `red-sin-archivo`: un RED mencionado no tiene archivo/enlace.
- `podcast-titulo`: hay un podcast → verificar título por escucha.
- `enlace-roto`: un enlace externo (eLibro, RAE…) parece caído.

## Reglas de parada (detener e informar al usuario)

- **Foro** mencionado en el texto → **NO es regla de parada**: es un RED. Enlázalo inline
  (`mod/forum/view.php?id=...`) y, si falta el id, deja el marcador + FLAG `dato-faltante`
  y continúa (reglas §18). Nunca lo dejes como texto plano.
- **Inconsistencia entre insumos** (PDF vs Word) → reportar; la autoridad es Syllabus/AAA.
- **Enlace externo caído** → FLAG `enlace-roto`; buscar reemplazo o reportar.

## Hecho cuando

- [ ] Tabla de Resumen con las filas EXACTAS de la AAA (sin cuestionarios inventados);
      `rowspan` según el caso (A: solo Momento; B: Momento + Duración/Semana).
- [ ] **Negrita del Resumen = espejo del AAA**: solo la etiqueta (`<strong>Avance N.</strong>`,
      `<strong>Cuestionario de evaluación –</strong>`); nunca el nombre/descripción del
      entregable ni la fila del cuestionario completa; separador `–`/`-` sin cambiar a `:`.
- [ ] **Descripción General** tomada de la tabla "Entregables del avance N…" (no de la de
      "reporte de avance — X%"); incluye SABER/SER/HACER y `<h4>Condiciones Particulares
      de Entrega</h4>`; sin la situación hipotética ni las condiciones formales.
- [ ] **Sin RED duplicados**: cada recurso una sola vez — inline si la prosa lo nombra,
      viñeta si es anuncio dedicado; video/presentaciones en viñeta con su caja.
- [ ] **Foros enlazados inline** (`mod/forum/view.php?id=…`) con FLAG si falta id; nunca texto plano.
- [ ] **Una pestaña por semana individual** (nunca fusionada), con `Semana N` y subtítulo `Avance N`.
- [ ] Botón de envío en la última semana de cada avance (`Enviar Entregable N`);
      **texto SIN punto final**; sin `<br>` antes del `<div>`.
- [ ] Sin guiones literales: enumeraciones `-Item.` convertidas a `<ul><li>`.
- [ ] Listas pegadas a su párrafo anunciador; párrafo de envío al final, encima del botón.
- [ ] Correcciones tipográficas aplicadas y reportadas (`CORRECCIONES:`); ningún `¿` perdido.
- [ ] Pestaña "Instrumento para Enviar Entregable" con el nº correcto de botones.
- [ ] Producto Final aplicado globalmente; recursos sin duplicar.
- [ ] Videos/diapositivas tratados como RED (o FLAG si faltan).
- [ ] Foros: FLAG `dato-faltante` emitido con descripción del foro.
- [ ] Inconsistencias PDF/Word: reportadas al usuario, no corregidas autónomamente.
- [ ] Enlace proxy eLibro con guion; enlaces verificados (FLAG si rotos).
- [ ] `python cli.py check` sin errores; FLAGS entregados.
