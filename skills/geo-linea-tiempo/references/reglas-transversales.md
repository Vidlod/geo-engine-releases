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

- Máximo `<br><br>` consecutivos (nunca 3+).
- Máximo 2 espacios consecutivos.
- Sin `<br>` justo antes de `</li>`, `</ul>`, `</ol>`, `</div>`.
- Sin `<br>` **entre bloques** `</p>`↔`<ul>`/`<ol>`: van consecutivos (`</p><ul>`).
  (Moodle ya aplica margen; el `<br>` duplica el espacio.)
- **Botón de envío sin `<br>` antes**: va directo tras el último párrafo (margen nativo).
  Nunca `<br>`/`<br><br>` ni `<p></p>` vacío antes del `<div>` del botón (ver sección 11).
- Sin cursiva: nada de `<em>` ni `font-style:italic`. (`<i>` puede ser ícono → revisar.)
- `(y)` / `(x)` → `(<span>y</span>)` / `(<span>x</span>)` (filtro emoticonos Moodle).
- "módulo/Módulo/módulos" → "curso/cursos".
- Enlaces `<a>` (salvo `#...`) con `target="_blank"` y `rel="noopener"`
  (`rel="noreferrer noopener"` para RAE/eLibro).
- Proxy eLibro con guion: `elibro-net.ezproxy.udes.edu.co`.
- Eliminar "a través del / en el tablero de anotaciones".
- Punto final en cada `<li>` de texto.
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
  van**, para que los suministre luego y se actualice el HTML. Cuando existan, se incrustan
  con caja responsiva de YouTube (o `@@PLUGINFILE@@` si son locales).
- **Podcasts** = RED: reproductor `<audio>` HTML5 dentro del `<li>`, y emite FLAG
  `podcast-titulo` para recordar verificar el título escuchando el audio:

```html
<li style="margin-bottom: 10px;"><strong>Podcast: Título.</strong><br><br>
    <audio controls="true" title="Podcast: Título">
        <source src="@@PLUGINFILE@@/Nombre.mp3">@@PLUGINFILE@@/Nombre.mp3
    </audio>
</li>
```

## 5. Citas bibliográficas

- Texto de la cita en **plano** (sin negrita ni cursiva), una cita por `<li>`.
- Enlace debajo, separado por `<br>`, visible y en negrita.
- **Punto final obligatorio DESPUÉS del enlace** (tras `</strong>`):

```html
<li>Autor (Año). Título...<br><strong><a href="URL" target="_blank" rel="noopener">URL</a></strong>.</li>
```

- Quitar textos pegados como "Lectura requerida." o "Lectura de ampliación temática.".

## 6. Viñetas y espaciado de grupos

- **Sin saltos entre bloques**: NO pongas `<br>`/`<br><br>` entre `</p>` y `<ul>`, ni entre
  `</ul>` y `<p>`. Deben ir **consecutivos** (`</p><ul>`, `</ul><p>`). Moodle aplica margen a
  los bloques; un `<br>` intermedio produce doble espacio. Esto **incluye** el `<div>` del
  botón de envío: va directo tras el último párrafo, sin `<br>` (ver sección 11).
- Si una viñeta supera 3 renglones, o dos viñetas tienen 2 renglones → `style="margin-bottom: 10px;"`
  en cada `<li>` del grupo. (Es visual: si dudas, emite FLAG en vez de adivinar.)

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

## 9. Insumo en HTML: respeta las negrillas del origen

El insumo llega **convertido a HTML** (no Word en texto plano). Por tanto:

- **Respeta los `<strong>` del origen**: lo que venga en negrita en el HTML de origen va
  en negrita en el resultado (salvo las excepciones de las reglas: las citas
  bibliográficas van en texto plano, sección 5).
- **Respeta la puntuación y los párrafos `<p>` del origen**: no fusiones frases ni
  elimines puntos. Cada `<p>` del origen es un párrafo aparte.
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

## 11. Espaciado de los botones de envío

- El botón va **directo tras el último párrafo**, separado solo por el margen nativo.
- **Prohibido** `<br>`/`<br><br>` o `<p></p>` vacío entre el contenido y el botón:

```html
<p style="text-align: justify;">...último párrafo / párrafo de envío.</p>
<div style="text-align: center;">
    <a href="https://virtual.udes.edu.co/mod/assign/view.php?id=XXXX" target="_blank" rel="noopener">
        <button type="button" class="btn btn-outline-primary btn-lg" aria-pressed="true" role="button">
            <span class="spinner-grow spinner-grow-sm"></span> Enviar Avance N.
        </button>
    </a>
</div>
```

- **Único caso permitido de separador**: un `<p></p>` vacío **entre dos botones
  consecutivos** en la pestaña "Instrumento para Enviar Entregable".

## 12. Recursos: ¿viñeta o negrita?

Al listar recursos debajo de la actividad que los menciona:

- **Recurso con enlace en el Word** (referencia bibliográfica) → viñeta `<li>` con la
  cita completa en texto plano + el enlace visible en negrita debajo (sección 5).
- **RED sin enlace** (mapas, infografías, presentaciones, etc.) → se deja en **negrita**
  simple `<strong>Título</strong>` (o con `@@PLUGINFILE@@` si es archivo local), no como cita.
- **No dupliques**: si un recurso ya se listó en su actividad (primer uso), no lo repitas
  en ninguna lista general posterior de esa semana.
