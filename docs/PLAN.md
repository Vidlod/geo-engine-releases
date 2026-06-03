# Plan de Arquitectura — geo-engine

> Registro oficial del diseño acordado. Fuente de verdad de la estrategia técnica.
> Última actualización: 2026-06-03

## 1. Problema y objetivos

El proyecto GEO maqueta cursos universitarios en HTML para Moodle (UDES), tomando
documentos fuente (Word/PDF/Excel) y convirtiéndolos en estructuras HTML que siguen
un conjunto extenso de reglas de formato.

Objetivos de esta refactorización:

1. **Automatización** — reducir el trabajo manual de maquetación.
2. **Ahorro de tokens** — que la IA no relea los archivos de contexto en cada tarea.
3. **Prevención de errores** — las reglas mecánicas no deben depender de la atención del LLM.
4. **Portabilidad** — utilizable por compañeros, técnicos y no técnicos.

## 2. Decisiones tomadas (con el usuario)

| Tema | Decisión |
| --- | --- |
| Equipo | **Mixto**: algunos usan Claude Code, otros no → núcleo compartido + dos frentes. |
| Presupuesto IA | **Solo local/gratis**: la web app es 100% determinista (sin LLM). La IA solo actúa vía la Skill en Claude Code. |
| Estabilidad de reglas | **Cambian a veces** (correcciones y adiciones de nuevas estructuras) → reglas como módulos + config externa, nunca hardcodeadas. |

## 3. Insight central

La mayoría de las reglas son **deterministas** (no necesitan IA):
límites de `<br>`, punto final en `<li>`, sin cursiva, "módulo"→"curso",
`(y)`→`(<span>y</span>)`, `rowspan` en tablas, cierres sin saltos, etc.

> **Cada regla que se mueve de "prosa que la IA recuerda" a "código que se ejecuta"
> = tokens ahorrados + una clase de error eliminada + más portable.**

Solo unas pocas reglas requieren **criterio** (justifican la IA):
ubicación de párrafo "Documento" vs "Forma de entrega", emparejar títulos de RED,
escuchar podcasts, extraer y ubicar contenido correcto.

## 4. Arquitectura: un motor, dos frentes

```
geo-engine/                     ← núcleo Python, SIN LLM, fuente única de verdad
├── parsers/      word · pdf · excel               (Fase 2)
├── templates/    entregable · glosario · momento · linea_tiempo  (Fase 2)
├── rules/        reglas mecánicas modulares        (Fase 1 — EN CURSO)
├── config/       rules.yaml (parámetros) · course.yaml (datos del curso)
├── linter.py     valida/corrige reglas             (Fase 1 — EN CURSO)
└── build.py      parse → plantilla → lint → HTML + flags  (Fase 2)
        ▲                                    ▲
   ┌────┴─────┐                        ┌─────┴──────┐
   │  SKILL   │  resuelve flags de     │  WEB APP   │  no técnicos: suben
   │ (Claude) │  criterio + corre el   │  (Flask)   │  archivos → HTML 90% +
   │          │  motor                 │            │  checklist de decisiones
   └──────────┘                        └────────────┘
```

La web app determinista entrega HTML al ~90% + un **checklist de flags** que requieren
criterio. Los flags simples los resuelve un compañero a mano; los complejos pasan a
quien tenga Claude Code + la Skill.

### Decisión técnica clave: regex/string sobre HTML crudo (no un parser DOM)

Las reglas dependen del **espaciado y la estructura exactos** del HTML. Un parser como
BeautifulSoup/lxml re-serializa y alteraría ese formato. Por eso el linter opera sobre
el texto crudo del HTML con expresiones regulares, preservando el formato original.

## 5. Fases

1. **Linter determinista** ✅ — reglas mecánicas como código + `rules.yaml`.
   Se puede correr sobre `3_paginas_finales/` actual para validar lo ya hecho.
2. **Skills multi-agente** 🟡 EN CURSO — ver sección 7. (Se adelantó antes que el motor.)
3. **Motor de plantillas** ⬜ — reutiliza `app.py`/mammoth: parse → llena → output + flags.
4. **Web app** ⬜ — frente para no técnicos sobre el mismo motor, con reporte de flags.

## 6. Decisiones de las Skills (con el usuario)

| Tema | Decisión |
| --- | --- |
| Agentes objetivo | **Claude Code + Google Antigravity (Gemini 3)**. Ambos con shell y archivos. |
| Granularidad | **Separadas por estructura** (entregable, glosario, momento, línea del tiempo). |
| Ejecución | **Degradación elegante**: la skill se sostiene sola y, con shell, invoca el linter. |

## 7. Arquitectura de las Skills

**Hallazgo clave**: Antigravity y Claude Code usan el **mismo formato `SKILL.md`**
(directorio con frontmatter `name`+`description`, subcarpetas `references/`/`scripts/`,
y carga progresiva). Solo cambia la carpeta de instalación:

- Claude Code → `<proyecto>/.claude/skills/<skill>/`
- Antigravity → `<proyecto>/.agent/skills/<skill>/`

Por eso cada skill se escribe **una sola vez** y se instala en ambos.

```
skills/
├── _common/reglas-transversales.md   ← FUENTE ÚNICA de reglas transversales
├── geo-entregable/   SKILL.md + references/  (criterio)
├── geo-glosario/     SKILL.md + references/  (determinista)
├── build.py          sincroniza _common en cada skill (autocontenidas)
└── install.py        instala en .claude/skills y/o .agent/skills
```

Principios:
- **Fuente única + skills autocontenidas**: `build.py` copia `_common/` dentro de cada
  skill (robusto entre agentes que no comparten contexto entre carpetas).
- **El linter manda en lo mecánico**: las skills no replican las reglas de formato; las
  delegan al linter y solo las resumen como respaldo para agentes sin shell.
- **Protocolo de FLAGS**: lo que requiere criterio y no se resuelve con los insumos se
  marca con `<!-- FLAG: [tipo] ... -->` en vez de inventar.

Estado: las 4 skills completas (`geo-entregable`, `geo-glosario`, `geo-momento`,
`geo-linea-tiempo`).

## 8. Contradicciones y contexto faltante en las reglas (detectado al construir las skills)

Hallazgos al cruzar `Reglas & Contexto.text`, `Instrucciones & Pasos.md` y
`procesos_plataforma_educativa.md`. Las skills aplican el "criterio adoptado" y emiten
FLAGS donde corresponde; pendiente de confirmación del usuario.

> **Estado: RESUELTAS por el usuario (2026-06-03).** Las decisiones están bakeadas en las
> skills y en `config/course.yaml`.

### ✅ Contradicción 1 — "Avance 5" vs "Producto Final" — RESUELTA
- **Decisión**: regla **global**. El último avance del último momento se renombra a
  "Producto Final" en CUALQUIER estructura. En Estadística (Momento 2 / Avance 5): donde
  diga "Avance 5" → "Producto Final". El nº del último avance vive en
  `course.yaml` → `last_avance`. Gana `Instrucciones §5`; se descarta el texto de
  `procesos_plataforma_educativa.md`.
  - **Automatizado**: además la verifica el linter (regla `producto-final`), que lee
    `course.last_avance` y reemplaza/avisa cualquier "Avance N" residual.

### ✅ Contradicción 2 — Semanas para botones de envío — RESUELTA
- **Decisión**: el botón va en la **última semana de cada avance**, según los rangos de
  la AAA del curso (varían por curso). Estadística: semanas **3 / 5 / 7 / 9 / 12**.
  Definido en `course.yaml` → `momentos[].avances[].week_boton`. Los números 6/8/10/14
  eran restos de Criminología (14 semanas) → se ignoran.

### ✅ Contexto 1 — Videos/diapositivas — RESUELTO
- **Decisión**: todo video o diapositiva en video **es un RED**. Varían por curso y suelen
  ser lo último en colocarse. La skill **advierte al usuario cuáles son y dónde van**
  (FLAG `dato-faltante`) para que los suministre y se actualice el HTML. (Los de
  Estadística aún no están disponibles.)

### ✅ Contexto 2 — Destino de los enlaces de la Línea del Tiempo — RESUELTO
- **Decisión**: el enlace de cada hito apunta **al mismo URL** que el botón de envío de
  ese avance en su Momento (`mod/assign/view.php?id=...`). Fuente única en
  `course.yaml` → `moodle_assign`. Los actuales de Estadística son correctos.

### ✅ Contexto 3 — IDs de Moodle — ACLARADO
- El `id=XXXX` es el identificador interno de la tarea de Moodle. Se guardan por curso en
  `course.yaml` → `moodle_assign` (compartidos por botones y timeline).

### ✅ Nota — Botón con punto final — CONFIRMADO
- Todos los botones de envío terminan en punto: `Enviar Avance 1.`, `Enviar Producto Final.`.

### 🔄 Actualización de reglas fuente (2026-06-03)
- `Reglas & Contexto.text` e `Instrucciones & Pasos.md §4` se actualizaron e **invirtieron**
  una regla de espaciado: antes pedían `<br><br>` entre un párrafo y una lista; ahora
  **prohíben** `<br>` entre bloques (`</p>`↔`<ul>`/`<ol>`), que deben ir consecutivos
  (`</p><ul>`). Moodle ya aplica margen a los bloques y el `<br>` duplica el espacio.
- **Impacto**: nueva regla del linter `br-between-blocks` (acotada a `p`/`ul`/`ol` para no
  afectar el `<br><br>` que precede al `<div>` del botón) + actualización de las skills
  (`_common/reglas-transversales.md` §2 y §6). Validado: la regla detectó 1 caso real en
  `Entregalbe Avance 1.html` (`</p><br><br><ul>`).

## 9. Diseño del Linter (Fase 1)

- Cada regla es una clase con `id`, `description`, `severity`, `auto_fixable`,
  y métodos `check()` / `fix()`.
- Un **registro** (`rules/__init__.py`) lista las reglas → añadir una = agregar clase + registrar.
- La **config** (`config/rules.yaml`) habilita/deshabilita cada regla y fija parámetros.
  Si PyYAML no está instalado, se usan los defaults embebidos (funciona out-of-the-box).
- Modos: `check` (reporta) y `fix` (aplica autofixes seguros; `--write` para persistir).
- El linter es la **red de seguridad universal**: venga el HTML de la web, de la Skill o
  de edición manual, se valida igual.

### Reglas incluidas en Fase 1

| id | Regla | Autofix |
| --- | --- | :---: |
| `max-br` | Máximo 2 `<br>` consecutivos | ✅ |
| `br-before-close` | Sin `<br>` antes de `</li>`/`</ul>`/`</ol>`/`</div>` | ✅ |
| `br-between-blocks` | Sin `<br>` entre bloques `p`/`ul`/`ol` (van consecutivos) | ✅ |
| `max-spaces` | Máximo 2 espacios consecutivos | ✅ |
| `terminology-module` | "módulo" → "curso" (conserva mayúscula/plural) | ✅ |
| `emoticon-span` | `(y)`/`(x)` → `(<span>y</span>)` | ✅ |
| `link-target` | `<a>` con `target="_blank"` + `rel` (excepto `#`) | ✅ |
| `elibro-proxy` | Proxy eLibro con guion: `elibro-net.ezproxy...` | ✅ |
| `tablero-anotaciones` | Elimina "tablero de anotaciones" | ✅ |
| `no-italics` | Quita `<em>` y `font-style:italic` (flag `<i>`: posible ícono) | ✅ |
| `li-paragraph` | Detecta `<p>` dentro de `<li>` | ⚠️ detect |
| `li-period` | `<li>` de texto debe terminar en `.`/`:`/`?`/`!` | ⚠️ detect |
| `producto-final` | "Avance N" (último, vía `course.yaml`) → "Producto Final" | ✅ |

### Reglas que requieren criterio o contexto visual (NO en el linter — van a la Skill / flags)

- Fusión `rowspan` en tablas de resumen (depende de la semántica de filas).
- `margin-bottom: 10px` por número de renglones (es visual, no medible en texto plano).
- Formato completo de citas bibliográficas (requiere identificar autor/enlace).
- Ubicación "Documento:" vs "Forma de entrega".
- Emparejar títulos de RED con archivos; títulos de podcast por escucha.
