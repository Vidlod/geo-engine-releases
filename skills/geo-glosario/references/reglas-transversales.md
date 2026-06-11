# Reglas transversales GEO (fuente única)

> Este archivo es la **fuente de verdad** de las reglas que aplican a TODAS las
> estructuras. `build.py` lo copia dentro de `references/` de cada skill.
> No edites las copias: edita este archivo y vuelve a correr `build.py`.

## 0. Regla de oro

- **No inventar, no parafrasear.** El texto debe coincidir exactamente con los
  documentos fuente (Word/PDF/Excel).
- Si algo **no se encuentra** o requiere una decisión que no puedes resolver con
  los insumos, **no asumas**: emite un FLAG (sección 1) y continúa con lo demás.

## 1. Protocolo de FLAGS (degradación elegante)

Cuando una decisión requiere criterio que los insumos no resuelven, NO la inventes.
Marca un flag visible y sigue. Al final de tu trabajo, entrega la lista de flags.

Formato dentro del HTML (comentario, fácil de buscar y quitar):

```html
<!-- FLAG: [tipo] descripción concreta de la decisión pendiente -->
```

Tipos: `ubicacion` (dónde va un párrafo), `red-sin-archivo` (RED sin enlace),
`podcast-titulo` (verificar por escucha), `dato-faltante`, `enlace-roto`.

Ejemplo: `<!-- FLAG: red-sin-archivo No hay archivo para "Infografía de variables" -->`

## 2. Reglas mecánicas → las aplica el LINTER

Las reglas de formato mecánico **NO debes aplicarlas a mano**: las verifica y corrige
el linter determinista (sección 8). Esta lista es solo un **respaldo** por si trabajas
en un agente sin acceso a shell:

- **Máximo UN `<br>`** en cualquier lugar (nunca `<br><br>`).
- **`margin-bottom` NUNCA**: no se usa para separar (ni en `<li>`, ni en `<p>`, ni en nada).
- **Los `<p>` ya traen su propio espacio**: no se les pone `<br>` ni margen alrededor.
- **El `<br>` solo separa viñetas (`<li>`) o elementos que NO sean `<p>`** (ver §6).
- Máximo 2 espacios consecutivos.
- Sin `<br>` justo antes de `</li>`, `</ul>`, `</ol>`, `</div>`.
- Sin cursiva: nada de `<em>` ni `font-style:italic`. (`<i>` puede ser ícono → revisar.)
- `(y)` / `(x)` → `(<span>y</span>)` / `(<span>x</span>)` (filtro emoticonos Moodle).
- "módulo/Módulo/módulos" → "curso/cursos".
- Enlaces `<a>` (salvo `#...`) con `target="_blank"` y `rel="noopener"`
  (`rel="noreferrer noopener"` para RAE/eLibro).
- Proxy eLibro con guion: `elibro-net.ezproxy.udes.edu.co`.
- Eliminar "a través del / en el tablero de anotaciones".
- Punto final en cada `<li>` de texto.
- **Botones de envío SIN punto final** (`Enviar Entregable 1`, no `Enviar Entregable 1.`).
- Nunca `<p>` dentro de `<li>`.

## 3. Enlaces a archivos locales: método portable @@PLUGINFILE@@

Todo recurso descargable (anexos, RED locales, syllabus, rúbrica, instrucciones)
se enlaza con el marcador de Moodle y el **nombre exacto** del archivo:

```html
<strong><a href="@@PLUGINFILE@@/Nombre_Exacto.ext" target="_blank" rel="noopener">Título</a></strong>
```

- Siempre en negrita (`<strong>`) y abriendo en pestaña nueva.
- **Prohibido** enlazar a OneDrive/SharePoint o URLs temporales `draftfile.php`.
- Si el archivo aún no existe, emite FLAG `red-sin-archivo` y deja solo el título en negrita.
- **Usa el MAPA DE ARCHIVOS, no inventes nombres.** Los nombres EXACTOS de archivo están
  en `config/course.yaml` → `files:` (skills) o en el mapa que provee el usuario (chat).
  Está **prohibido** inventar nombres a partir del texto visible (p. ej.
  `Anexo_1._Base_de_datos_indicadores...xlsx` o `Rubrica_Momento_I.pdf`). Si un término
  no está mapeado, emite FLAG `dato-faltante` y deja el título solo en negrita.
- **Enlazar CADA mención (no solo la primera).** Recursos recurrentes que se enlazan
  **siempre que aparezcan** en el texto, en CUALQUIER pestaña/semana:
  **syllabus, rúbrica** (incl. "la rúbrica", "rúbrica de evaluación"), **mapa**
  (conceptual/mental), **Anexo N**, **plantilla/formato** (Entregable N), **instrucciones
  generales**. Si "rúbrica" sale 5 veces, va hipervinculada las 5 veces.

## 4. Recursos Educativos Digitales (RED)

- Cada RED va **siempre en su propia viñeta** `<li>` (nunca suelto ni como `<p>`).
- Con archivo local → enlace `@@PLUGINFILE@@` (sección 3).
- Sin archivo ni enlace → solo `<strong>Título del RED</strong>`.
- Recursos compuestos (Parte I / Parte II) → una viñeta por parte.
- **Videos y diapositivas en video** = RED: van en viñeta como cualquier otro recurso.
  Varían por curso y **casi siempre son los últimos en colocarse**. Si aún no los tienes,
  NO los inventes: emite FLAG `dato-faltante` indicando al usuario **cuáles son y dónde
  van**. Cuando existan, se incrustan con la **caja responsiva de YouTube** (plantilla abajo)
  o con `@@PLUGINFILE@@` si son locales.

**Plantilla de video YouTube** (dentro del `<li>` del RED; un solo `<br>` antes de la caja):

```html
<li><strong>Diapositivas en vídeo:</strong> objeto de la criminología.<br>
    <div style="max-width: 360px; margin: 0 auto;">
        <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
            <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/VIDEO_ID?si=XXXX&amp;start=1" frameborder="0" allowfullscreen=""></iframe>
        </div>
    </div>
</li>
```

- **Podcasts** = RED: reproductor `<audio>` HTML5 dentro del `<li>`, con **un solo `<br>`**
  antes del `<audio>`. Emite FLAG `podcast-titulo` para verificar el título escuchando:

```html
<li><strong>Podcast: Título.</strong><br>
    <audio controls="true" title="Podcast: Título">
        <source src="@@PLUGINFILE@@/Nombre.mp3">@@PLUGINFILE@@/Nombre.mp3
    </audio>
</li>
```

## 5. Citas bibliográficas

- Texto de la cita en **plano** (sin negrita ni cursiva), una cita por `<li>`.
- Enlace debajo, separado por `<br>`, visible y en negrita.
- **Punto final obligatorio DESPUÉS del enlace** (tras `</strong>`).
- **Entre citas consecutivas va un `<br>` de separación** (`</li><br><li>`): son viñetas
  multilínea (texto + enlace) y, sin ese `<br>`, se ven pegadas en Moodle (ver §6).

```html
<ul>
    <li>Autor (Año). Título...<br><strong><a href="URL" target="_blank" rel="noopener">URL</a></strong>.</li>
    <br>
    <li>Otro Autor (Año). Otro título...<br><strong><a href="URL2" target="_blank" rel="noopener">URL2</a></strong>.</li>
</ul>
```

- Quitar textos pegados como "Lectura requerida." o "Lectura de ampliación temática.".

## 6. Modelo de espaciado (cómo se separan los elementos)

Este es el sistema real que usa Moodle. **No uses `margin-bottom` nunca.**

| Situación | Mecanismo |
|---|---|
| Entre dos `<p>` | nada — el `<p>` ya trae su espacio |
| `<p>` → `<ul>` (entrando a una lista) | nada — el `<p>` ya trae su espacio; van consecutivos |
| `<ul>` / `<ol>` → `<p>` (**saliendo** de una lista) | **un** `<br>` (`</ul><br><p>`) — al salir de la lista el `<p>` no tiene margen superior y queda pegado a la última viñeta |
| Entre viñetas **con mucho texto** (multilínea: citas, descripciones largas) | **un** `<br>` entre ellas (`</li><br><li>`) |
| Entre viñetas de un **grupo de RED** (mapas, videos, podcasts…) | **siempre un** `<br>` entre ellas (`</li><br><li>`) |
| Entre viñetas **cortas** (Portada, Introducción, Conclusiones, enumeraciones de una línea) | nada — van consecutivas |
| Dentro de una viñeta, antes de un iframe/audio | **un** `<br>` |
| Antes del `<div>` del botón de envío | nada — el `<p>` anterior ya separa |
| Entre dos botones (pestaña "Instrumento") | un `<p></p>` vacío |
| Encima de un `<h4>` secundario | un `<br>` al inicio del `<h4>` (`<h4><br>Título</h4>`) |

- **Regla de oro del espaciado:** el `<br>` solo aparece **entre viñetas o dentro de
  ellas / entre elementos que no sean `<p>`**. Los `<p>` se auto-espacian.
- **¿Cuándo va `<br>` entre viñetas?** Cuando la viñeta lleva **mucho texto** (multilínea)
  o pertenece a un **grupo de RED** (estos van **siempre** separados con `<br>`). Las
  viñetas **cortas de una línea** (Portada/Introducción/Conclusiones, enumeraciones
  breves) van **consecutivas, sin `<br>`**.
- El `<br>` de separación va **entre** dos viñetas (`</li><br><li>`), **nunca** justo
  antes de `</ul>`/`</ol>` (el `<ul>` ya cierra su propio espacio; el linter lo borra).
- **Saliendo de una lista hacia un `<p>`** (`</ul><br><p>` o `</ol><br><p>`) va **un**
  `<br>`. Es la **única** transición entre bloques que lleva `<br>`; las demás
  (`<p>→<p>`, `<p>→<ul>`, `<p>→botón`) van **sin** `<br>`. (El linter respeta este `<br>`.)
- **Nunca `margin-bottom`** (ni `10px` en `<li>` ni en ningún lado).
- **Nunca `<br><br>`**: máximo un `<br>`.

## 7. Nomenclatura "Producto Final"

El **último avance del último momento** pasa a llamarse **Producto Final** de forma
**global**: en CUALQUIER estructura (tabla resumen, pestañas, botones, títulos, atributos
`title`, línea del tiempo, etc.). Donde aparezca ese "Avance N" se reemplaza por
"Producto Final".

- Ejemplo (curso de Estadística): el último momento es el 2 y su último avance es el 5;
  por tanto, en todo el HTML donde diga "Avance 5" → "Producto Final".
- El número del último avance es propio de cada curso: se define en `config/course.yaml`
  (`last_avance`). No lo asumas: tómalo de la AAA / la config del curso.

## 8. El LINTER (red de seguridad determinista)

Tras maquetar, valida y autocorrige el formato mecánico. Si tu agente puede ejecutar shell:

```bash
# Desde la raíz de geo-engine:
python cli.py fix "ruta/al/archivo.html" --write    # aplica autocorrecciones
python cli.py check "ruta/al/archivo.html" -v        # reporta lo que queda
```

- `check` lista errores/advertencias; resuélvelos antes de dar por terminado.
- Si **no** puedes ejecutar shell, aplica manualmente la lista de la sección 2.
- El linter es la autoridad sobre las reglas mecánicas: no las repliques a mano si el linter corre.

## 9. Trasplante 1:1 desde el AAA convertido a HTML

El insumo llega **convertido a HTML** por mammoth (no Word en texto plano).
La regla es **trasplante 1:1**: cada `<p>` del origen = exactamente un `<p>` en la salida.

**Prohibido:**
- Unir dos `<p>` del origen en uno solo.
- Partir un `<p>` del origen en dos o más `<p>`.
- Eliminar o añadir puntos (`.`) ni comas.
- Reescribir, resumir o parafrasear el texto.
- Inventar separaciones que el Word no tiene.

**Permitido** (solo estas intervenciones sobre el texto del origen):
- Añadir enlaces `<strong><a href="@@PLUGINFILE@@/...">...</a></strong>` sobre palabras clave.
- Añadir `<strong>` donde el origen ya tiene negrita.
- Añadir `<br><br>` internos que el HTML convertido ya traiga del Word.
- Convertir atribuciones "Autor (Año). Título." de RED propios a formato viñeta (sección 12).
- **Enumeraciones con guion → lista real.** Una secuencia de `<p>` que empiezan con
  guion (`-Portada.`, `-Introducción.`, `-Investiguen un caso...`) se convierte en
  `<ul>` con un `<li>` por ítem, **quitando el guion** y conservando el texto intacto.
  Nunca dejes guiones literales como viñetas. Sub-ítems → `<ul>` anidada.
- Las **correcciones tipográficas obligatorias** de la sección 17 (con reporte).

**Flujo correcto:**
```
AAA.docx → mammoth → AAA.html  ← fuente autoritativa de párrafos
    cada <p> del AAA.html      →  un <p> en el momento (solo añade enlaces/negrita)
    cli.py check               →  reglas mecánicas
    cli.py fidelity AAA.html momento.html  →  verifica que no se perdieron párrafos
```

**Respeta también:**
- Los `<strong>` del origen (las citas bibliográficas son excepción: texto plano, §5).
- No agregues negrita donde el origen no la tiene, ni la quites donde sí la tiene.

## 10. Títulos de actividades

Las actividades se titulan **`Actividad N: Nombre`** en negrita:

```html
<strong>Actividad 1: Organizador gráfico</strong>
```

- **Numeración continua por avance** (no reinicia por semana): si un avance abarca varias
  semanas, las actividades se numeran 1, 2, 3, 4... de corrido a lo largo de esas semanas.
- **Elimina el texto de andamiaje del AAA** como "Título de la actividad": usa solo el
  nombre real de la actividad.
- Corrige mayúscula inicial y tildes del nombre (p. ej. "grafico" → "gráfico",
  "contexto" → "Contexto").

## 11. Botones de envío

- El botón va **directo tras el último párrafo** (el `<p>` ya aporta su espacio).
- **Sin `<br>`** ni `<p></p>` vacío entre el contenido y el botón.
- **Texto del botón SIN punto final**: `Enviar Entregable 1` (no `Enviar Entregable 1.`).

```html
<p style="text-align: justify;">...último párrafo / párrafo de envío.</p>
<div style="text-align: center;">
    <a href="https://virtual.udes.edu.co/mod/assign/view.php?id=XXXX" target="_blank" rel="noopener">
        <button type="button" class="btn btn-outline-primary btn-lg" aria-pressed="true" role="button">
            <span class="spinner-grow spinner-grow-sm"></span> Enviar Entregable 1
        </button>
    </a>
</div>
```

- **Entre dos botones** consecutivos (pestaña "Instrumento para Enviar Entregable"):
  un `<p></p>` vacío como separador.

## 12. Recursos: distinguir RED del experto vs cita bibliográfica


Hay **dos tipos** de recurso y se formatean distinto. No los confundas.

### A) RED (recursos del curso / del experto disciplinar)
Syllabus, rúbrica, mapa, video de bienvenida/presentación, infografías, presentaciones,
podcasts, etc. **Aunque el AAA los escriba con formato autor-año** (p. ej.
`Torres, L. (2025). Mapa mental Estadística Descriptiva.`), **son RED, NO citas**:

- **Quita la atribución autor-año** (el autor del curso está en `course.yaml` → `autor_red`,
  p. ej. "Torres, L. (2025)."). Deja **solo el título** del recurso.
- Va en **negrita**; con `@@PLUGINFILE@@` si hay archivo en el mapa, o solo negrita +
  FLAG `red-sin-archivo` si no hay archivo.

```html
<ul>
    <li><strong><a href="@@PLUGINFILE@@/Mapa_Curso_Estadística.pdf" target="_blank" rel="noopener">Mapa mental Estadística Descriptiva</a></strong>.</li>
    <br>
    <li><strong>Video de presentación y bienvenida del curso Estadística Descriptiva</strong>.</li>
</ul>
```

> Un **grupo de RED en viñetas** lleva **siempre** un `<br>` entre cada viñeta para
> separar los recursos (son independientes); ver §6. Sin ese `<br>` se ven pegados en Moodle.

### B) Cita bibliográfica externa
Libros/artículos de terceros (Posada 2016, Martínez 2013, etc.) con su URL externa propia:
- Viñeta `<li>` con la cita en **texto plano** (conserva autor-año) + el enlace externo
  visible en negrita debajo, separado por `<br>` (sección 5).

### Reglas comunes
- Las viñetas de RED y de citas pueden convivir en la misma `<ul>` (como en la referencia).
- **No dupliques** un recurso ya listado en su actividad (primer uso).

## 13. Verificación de enlaces externos caídos

Antes de dar por terminado cualquier HTML, verifica los enlaces externos (eLibro, RAE,
Dialnet, etc.) para descartar URLs caídas.

- **Proxy eLibro**: para probar externamente quita el prefijo del proxy
  (`elibro-net.ezproxy.udes.edu.co` → `elibro.net`). El dominio institucional siempre
  lleva guion: `elibro-net.ezproxy.udes.edu.co` (sin guion → enlace roto para estudiantes).
- Si un enlace está caído → emite FLAG `enlace-roto` y busca reemplazo o reporta al usuario.
  **No dejes un enlace roto en el HTML final.**

## 14. Créditos académicos y Rúbrica 1 (Introducción al Curso)

- Los **créditos académicos, horas con acompañamiento docente y total de horas** del
  apartado "Detalles del Curso" se extraen **obligatoriamente de la Rúbrica 1** del curso.
- En la página de Información del Curso, el botón de **Rúbricas** enlaza siempre y
  exclusivamente la **Rúbrica 1** (`RUBRICA1_NombreCurso.pdf`), que es la rúbrica inicial
  de proceso.

## 15. Consistencia de insumos: PDF vs Word

- En caso de **discrepancias o contradicciones** entre archivos PDF y documentos Word
  (créditos, ponderaciones, estructura de actividades, etc.): la **autoridad es el
  Syllabus y la AAA**.
- Ante cualquier inconsistencia: **detén el procesamiento e informa al usuario** de
  inmediato para que decida. **No corrijas de forma autónoma** en el HTML.

## 16. Secuencia de lectura: cada lista pegada a su párrafo anunciador

- Un párrafo que termina en `:` **anuncia la lista que le sigue** (bibliografía,
  RED, temas clave, estructura del documento). La lista va **inmediatamente
  después** de ese párrafo: prohibido mover la bibliografía o los RED al final
  de la pestaña o reordenar secciones.
- **No dupliques párrafos anunciadores**: un anunciador por lista. No copies
  fórmulas de otra semana ("Igualmente, apóyese de los RED...") si el origen
  solo trae una.
- El **párrafo de envío** ("Envíe el documento en formato PDF...") va siempre de
  **último**, justo encima del botón de envío — después de secciones adicionales
  como "Exposiciones orales".

## 17. Correcciones tipográficas OBLIGATORIAS (con reporte)

Única edición de texto permitida además de la sección 9. Corrige SOLO estos
defectos evidentes del origen y **reporta cada cambio**:

1. **Negrita rota a mitad de palabra**: `**estructura**r` → `<strong>estructurar</strong>`
   (la negrita se extiende a la palabra completa, nunca `<strong>estructura</strong>r`).
2. **Signo de apertura faltante**: `Cuál es...?` → `¿Cuál es...?`. Y a la inversa:
   **nunca pierdas un `¿`/`¡` que el origen sí tiene**.
3. **Erratas evidentes de una palabra**: "Comprar y analizar" → "Comparar y analizar";
   "experta disciplina" → "experta disciplinar".
4. **Anglicismos de conversión** (palabras en inglés coladas por el convertidor):
   "aspects" → "aspectos", "explaining" → "explicando", "interviews" → "entrevistas".
5. Al **eliminar "tablero de anotaciones"** la frase debe quedar gramatical:
   `envíelo en formato PDF a través del tablero de anotaciones en las fechas
   establecidas` → `envíelo en formato PDF en las fechas establecidas`.

Al final del trabajo entrega, junto a los FLAGS, la lista `CORRECCIONES:` con cada
cambio (`origen → corregido`, indicando semana/pestaña). Cualquier otra duda de
redacción **NO se corrige**: FLAG `ubicacion` o `dato-faltante`.

## 18. Foros

- Siempre que el texto haga referencia a cualquier tipo de **foro** (social, punto de
  encuentro, presentación, etc.): **detente e informa al usuario** para que proporcione
  el enlace de Moodle (`mod/forum/view.php?id=...`).
- No avances sin el enlace: emite FLAG `dato-faltante` con la descripción del foro y
  continúa con el resto del contenido.
