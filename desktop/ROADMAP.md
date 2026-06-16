# 🗺️ GEO Engine Desktop — Hoja de Ruta

> Documento vivo con las funcionalidades planificadas para futuras versiones de
> GEO Engine Desktop. Cada sección describe una característica, sus capacidades
> clave, notas técnicas de integración y su estado actual.

---

## 🧩 Gestor de Skills (Skills Manager)

**Estado:** ✅ Implementado

### Descripción

Interfaz visual simplificada para crear, editar y organizar los skills del
proyecto GEO. A diferencia de la plantilla actual basada en archivos Markdown,
esta herramienta proporciona formularios guiados que reducen la curva de
aprendizaje y minimizan errores de formato.

### Capacidades clave

- **Vista de tarjetas** para navegar todos los skills existentes con búsqueda y
  filtros por tipo (Momento, Entregable, Glosario, etc.)
- **Formularios guiados** para crear nuevos skills paso a paso, con validación
  en tiempo real de los campos requeridos (`SKILL.md`, prompts, plantillas)
- **Editor inline de prompts y plantillas** con resaltado de sintaxis Markdown y
  vista previa del resultado
- **Importar/exportar skills como paquetes** (archivos `.zip` o `.geo-skill`)
  para compartir entre equipos o respaldar configuraciones
- **Detección de conflictos** al importar skills con nombres o IDs duplicados
- **Historial de versiones local** para revertir cambios en un skill

### Notas técnicas

- Los skills se almacenan actualmente en `/skills/generic/` como archivos
  `*-prompt.md`. El gestor leerá y escribirá directamente en esta carpeta
  mediante las APIs de `fs` de Node.js expuestas a través del `preload.js`.
- La interfaz se implementará como una nueva ruta dentro de la web app (Vite +
  vanilla JS), accesible desde el menú principal de Electron.
- El empaquetado de skills utilizará la API `archiver` de Node.js para generar
  los archivos comprimidos.
- Se integrará con `ipcMain`/`ipcRenderer` para las operaciones de lectura y
  escritura del sistema de archivos, manteniendo la seguridad del sandbox.

### Mockup conceptual

```
┌─────────────────────────────────────────────────────────┐
│  Skills Manager                            [+ Nuevo]    │
├─────────────────────────────────────────────────────────┤
│  🔍 Buscar skill...                                     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 📄       │  │ 📄       │  │ 📄       │              │
│  │ Momento  │  │ Entreg.  │  │ Glosario │              │
│  │ v1.2     │  │ v1.0     │  │ v1.1     │              │
│  │ [Editar] │  │ [Editar] │  │ [Editar] │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  ┌──────────┐  ┌──────────┐                             │
│  │ 📄       │  │ 📄       │                             │
│  │ Línea T. │  │ Intro    │                             │
│  │ v1.0     │  │ v1.3     │                             │
│  │ [Editar] │  │ [Editar] │                             │
│  └──────────┘  └──────────┘                             │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Gestión Inteligente de Carpetas y Workspace

**Estado:** ✅ Implementado

### Descripción

Abrir una carpeta raíz de un curso como "workspace" completo, con detección
automática de la estructura del curso y navegación por componentes. Transforma
GEO Engine de una herramienta de archivo individual a un editor de proyecto
completo.

### Capacidades clave

- **Abrir carpeta raíz** de un curso como workspace con un solo clic o
  arrastrándola a la ventana
- **Vista de árbol** del sistema de archivos del curso con iconos diferenciados
  por tipo (HTML, PDF, DOCX, imágenes, RED)
- **Detección automática de estructura** del curso: identifica Momentos,
  Entregables, Glosario, Línea del Tiempo, Introducción y RED según las
  convenciones de nombres GEO
- **Panel lateral de navegación** por componentes detectados, con indicadores de
  estado (✅ válido, ⚠️ advertencias, ❌ errores)
- **Guardar/restaurar workspaces recientes** con acceso rápido desde la pantalla
  de inicio
- **Búsqueda global** dentro de todos los archivos HTML del workspace

### Notas técnicas

- Se utilizará `dialog.showOpenDialog` de Electron con `properties:
  ['openDirectory']` para seleccionar la carpeta raíz.
- La detección de estructura se basará en expresiones regulares sobre los
  nombres de archivo y carpetas, siguiendo las convenciones existentes del
  proyecto GEO (p. ej. `Momento_1/`, `Entregable_2.html`).
- El estado de cada workspace se persistirá en un archivo JSON local dentro de
  `userData` de Electron (`app.getPath('userData')`).
- El árbol de archivos se generará con `fs.readdirSync` recursivo, con
  observadores `fs.watch` para actualizaciones en tiempo real.

### Mockup conceptual

```
┌──────────────────┬──────────────────────────────────────┐
│  WORKSPACE       │                                      │
│  📁 Curso_ABC    │   [Editor / Preview del archivo      │
│  ├── 📁 Momento1 │    seleccionado]                     │
│  │   ├── ✅ M1   │                                      │
│  │   └── ⚠️ E1   │                                      │
│  ├── 📁 Momento2 │                                      │
│  │   ├── ✅ M2   │                                      │
│  │   └── ❌ E2   │                                      │
│  ├── ✅ Glosario │                                      │
│  ├── ✅ Línea T. │                                      │
│  └── 📁 RED      │                                      │
│                  │                                      │
│  ── Recientes ── │                                      │
│  📁 Curso_XYZ    │                                      │
│  📁 Curso_DEF    │                                      │
└──────────────────┴──────────────────────────────────────┘
```

---

## 🧹 Automatización del Sistema de Archivos (El Saneador)

**Prioridad:** 🟡 Media
**Estado:** 📋 En Proceso

### Descripción

Herramienta integrada que escanea una carpeta del curso y detecta problemas en
el sistema de archivos automáticamente. Desde archivos duplicados hasta nombres
que no cumplen las convenciones GEO, "El Saneador" limpia y organiza la
estructura del curso antes de la entrega.

### Capacidades clave

- **Escaneo automático** de la carpeta del curso al abrirla como workspace
- **Detección de archivos duplicados** por hash (SHA-256) con sugerencia de cuál
  conservar
- **Validación de nombres** contra las convenciones GEO: mayúsculas/minúsculas,
  caracteres especiales, prefijos obligatorios
- **Detección de extensiones faltantes** o incorrectas
- **Renombrado masivo** siguiendo las convenciones GEO con un clic
- **Vista previa de cambios** antes de aplicar (modo dry run): muestra una tabla
  con "antes → después" para cada archivo afectado
- **Log detallado** de todas las operaciones realizadas, exportable como archivo
  de texto

### Notas técnicas

- Se implementará como un módulo independiente en `server/sanitizer.js` que
  recibe una ruta y devuelve un reporte JSON con los problemas encontrados.
- La comparación de duplicados usará `crypto.createHash('sha256')` de Node.js
  para calcular hashes de archivos.
- El renombrado masivo usará `fs.rename` con una cola de operaciones que permite
  deshacer (undo) mediante un log de transacciones.
- La interfaz mostrará una tabla diff-style con checkbox para seleccionar qué
  cambios aplicar.

### Mockup conceptual

```
┌─────────────────────────────────────────────────────────┐
│  🧹 El Saneador               [Escanear] [Aplicar Todo]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️  3 problemas encontrados en 47 archivos             │
│                                                         │
│  ☑ 📄 MOMENTO 1.html → Momento_1.html       [Renombrar]│
│  ☑ 📄 entregable2.HTML → Entregable_2.html  [Renombrar]│
│  ☑ 📄 copia_glosario(2).html                [Eliminar] │
│                                                         │
│  ─── Log ───────────────────────────────────────────    │
│  09:15:01  Escaneo iniciado: /Curso_ABC/                │
│  09:15:02  47 archivos analizados                       │
│  09:15:02  2 nombres no convencionales                  │
│  09:15:02  1 archivo duplicado (SHA-256 coincide)       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## ↕️ Interfaz Drag & Drop Avanzada

**Prioridad:** 🟡 Media
**Estado:** 📋 Planificado

### Descripción

Capacidades avanzadas de arrastrar y soltar que transforman el editor en una
herramienta visual de composición. Desde reorganizar secciones del HTML hasta
arrastrar archivos desde el Finder o Explorer directamente al editor.

### Capacidades clave

- **Reorganización visual de secciones** dentro del HTML: arrastrar bloques
  completos (pestañas, tablas, listas) para reordenarlos
- **Arrastrar archivos desde el Finder/Explorer** directamente al editor para
  insertarlos como referencia, imagen o enlace
- **Reordenar elementos del curso** (Momentos, Entregables) con drag & drop en
  el panel lateral del workspace
- **Vista WYSIWYG con handles de arrastre**: cada sección muestra un ícono de
  agarre al pasar el cursor, indicando que es movible
- **Guías visuales de inserción**: líneas horizontales animadas que indican dónde
  se insertará el elemento al soltar
- **Soporte multi-selección**: seleccionar varios elementos y moverlos como
  grupo

### Notas técnicas

- Se utilizará la API nativa de HTML5 Drag and Drop (`dragstart`, `dragover`,
  `drop`) con polyfills para comportamiento consistente entre plataformas.
- La reorganización de secciones operará sobre el DOM del editor, actualizando
  el HTML fuente internamente mediante la referencia al nodo movido.
- Para archivos arrastrados desde fuera del navegador, se usará el evento
  `drop` con `dataTransfer.files` en combinación con `ipcRenderer` para
  acceder a la ruta completa del archivo.
- Se evaluará la integración de una biblioteca ligera como SortableJS para la
  funcionalidad de listas reordenables.

### Mockup conceptual

```
┌─────────────────────────────────────────────────────────┐
│  Editor WYSIWYG                                         │
│                                                         │
│  ⠿ ┌─────────────────────────────────────┐              │
│    │ Sección: Competencias               │              │
│    │ Lorem ipsum dolor sit amet...       │              │
│    └─────────────────────────────────────┘              │
│                                                         │
│  ── ── ── ── ── ── ── ── ── ── ── ── ──  ← soltar aquí │
│                                                         │
│  ⠿ ┌─────────────────────────────────────┐  ↕ arrastr. │
│    │ Sección: Actividades de Aprendizaje │              │
│    │ 1. Lea el documento...              │              │
│    └─────────────────────────────────────┘              │
│                                                         │
│  ⠿ ┌─────────────────────────────────────┐              │
│    │ Sección: Recursos Educativos        │              │
│    │ • Libro: Fundamentos de...          │              │
│    └─────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## 🔗 Mapeador de Enlaces e IDs (Link Resolver)

**Estado:** ✅ Implementado

### Descripción

Escanea todos los archivos HTML del workspace y construye un mapa completo de
enlaces internos, IDs y anclas. Detecta automáticamente enlaces rotos,
identificadores duplicados y referencias huérfanas, con sugerencias de
corrección automática.

### Capacidades clave

- **Escaneo completo del workspace**: analiza todos los archivos HTML y
  construye un índice de todos los `href`, `id` y `name` encontrados
- **Detección de enlaces rotos (404)**: identifica enlaces que apuntan a
  archivos o anclas inexistentes
- **Detección de IDs duplicados**: alerta cuando dos o más elementos comparten
  el mismo `id` dentro de un archivo o entre archivos
- **Anclas huérfanas**: detecta `id` que ningún enlace referencia (posible
  basura)
- **Sugerencias de corrección automática**: propone el enlace correcto basándose
  en similitud de texto (distancia de Levenshtein)
- **Vista de grafo de dependencias**: visualización interactiva de las relaciones
  entre páginas del curso
- **Validación de rutas `@@PLUGINFILE@@`**: contrasta las rutas de Moodle contra
  los archivos RED reales presentes en el workspace

### Notas técnicas

- El parser de HTML utilizará una biblioteca ligera como `node-html-parser`
  para extraer todos los atributos `href`, `src`, `id` y `name` de cada
  archivo.
- El grafo de dependencias se renderizará con Mermaid.js (ya presente en el
  ecosistema del proyecto) o con una biblioteca de grafos como `vis-network`.
- La validación de `@@PLUGINFILE@@` comparará los nombres de archivo extraídos
  de las rutas Moodle contra el listado real de archivos en la carpeta `RED/`
  del workspace.
- Los resultados se cachearán en memoria y se actualizarán incrementalmente
  cuando `fs.watch` detecte cambios en archivos HTML.

### Mockup conceptual

```
┌─────────────────────────────────────────────────────────┐
│  🔗 Link Resolver                        [Re-escanear] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📊 Resumen: 142 enlaces · 38 IDs · 5 problemas        │
│                                                         │
│  ❌ Momento_1.html:23                                   │
│     href="#competencia-3" → ID no encontrado             │
│     💡 Sugerencia: #competencias-3 (1 carácter)         │
│                                                         │
│  ⚠️  Entregable_2.html:45                               │
│     @@PLUGINFILE@@/Rubrica_E2.pdf → archivo no existe   │
│     💡 Archivos similares: Rubrica_E2_v2.pdf            │
│                                                         │
│  ⚠️  Glosario.html:12 + Momento_2.html:67               │
│     ID duplicado: "tabla-verbos"                        │
│                                                         │
│  ─── Grafo ─────────────────────────────────────────    │
│     [Momento 1] ──→ [Entregable 1]                      │
│     [Momento 1] ──→ [Glosario]                          │
│     [Momento 2] ──→ [Entregable 2]                      │
│     [Línea T.] ──→ [Momento 1] [Momento 2] [Momento 3] │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Linter Visual y Validador One-Click

**Prioridad:** 🔴 Alta
**Estado:** 📋 En Proceso

### Descripción

Ejecutar el linter GEO sobre todos los archivos HTML del workspace con un solo
clic. Dashboard visual con métricas de calidad, corrección automática masiva y
exportación de reportes. Evoluciona el linter actual de archivo individual a una
herramienta de calidad a nivel de proyecto.

### Capacidades clave

- **Ejecución masiva**: lintear todos los archivos HTML del workspace con un
  solo clic desde el menú o con un atajo de teclado
- **Dashboard visual** con métricas claras:
  - Archivos limpios vs. archivos con errores (gráfico de dona)
  - Errores por regla (gráfico de barras)
  - Tendencia temporal (mejora entre ejecuciones)
- **Corrección automática masiva** (Fix All): aplica auto-fix a todos los
  archivos que lo permitan, con resumen de cambios
- **Historial de validaciones**: registro de cada ejecución del linter con fecha,
  archivos procesados y resultados
- **Exportar reporte de calidad en PDF**: genera un documento formal con el
  estado del curso, útil para entregas y auditorías
- **Filtros avanzados**: filtrar resultados por severidad, por regla, por archivo
  o por tipo de componente (Momento, Entregable, etc.)

### Notas técnicas

- El linter JS ya existe en la web app y aplica 15 reglas portadas de Python.
  Se reutilizará como módulo importable, ejecutándolo sobre cada archivo HTML
  del workspace mediante un worker de Node.js (`worker_threads`) para no
  bloquear la interfaz.
- El dashboard usará gráficos SVG generados en el frontend (sin dependencia
  externa de charting), o bien una biblioteca ligera como Chart.js.
- La generación de PDF se realizará con `jsPDF` o mediante la impresión nativa
  de Electron (`webContents.printToPDF()`).
- El historial se almacenará en un archivo JSON dentro de `userData`, indexado
  por workspace y fecha de ejecución.

### Mockup conceptual

```
┌─────────────────────────────────────────────────────────┐
│  ✅ Linter Dashboard           [Lint All] [Fix All]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────┐  ┌────────────────────────────────────┐ │
│  │  🟢 12     │  │  Errores por regla                 │ │
│  │  archivos  │  │  ████████ max-br (8)               │ │
│  │  limpios   │  │  █████ link-target (5)             │ │
│  │            │  │  ███ no-italics (3)                │ │
│  │  🔴 5      │  │  ██ terminology (2)               │ │
│  │  con error │  │  █ br-before-close (1)            │ │
│  └────────────┘  └────────────────────────────────────┘ │
│                                                         │
│  ─── Archivos con errores ──────────────────────────    │
│  📄 Momento_1.html         3 errores  [Ver] [Fix]      │
│  📄 Entregable_2.html      2 errores  [Ver] [Fix]      │
│  📄 Glosario.html          1 error    [Ver] [Fix]      │
│                                                         │
│  ─── Última ejecución: 2026-06-11 09:30 ────────────   │
│  [📥 Exportar PDF]  [📋 Ver historial]                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Resumen de Prioridades

| Prioridad | Característica                                  | Estado       |
| :-------: | ----------------------------------------------- | :----------: |
| 🔴 Alta   | 🧩 Gestor de Skills                             | 📋 Planificado |
| 🔴 Alta   | 📁 Gestión de Carpetas y Workspace              | 📋 Planificado |
| 🔴 Alta   | 🔗 Mapeador de Enlaces e IDs                    | 📋 Planificado |
| 🔴 Alta   | ✅ Linter Visual y Validador One-Click          | 📋 Planificado |
| 🟡 Media  | 🧹 Automatización del Sistema de Archivos       | 📋 Planificado |
| 🟡 Media  | ↕️ Interfaz Drag & Drop Avanzada                | 📋 Planificado |

---

> **Nota:** esta hoja de ruta es un documento vivo y se actualizará conforme
> avance el desarrollo. Las prioridades pueden ajustarse según las necesidades
> del equipo y los requisitos del proyecto GEO.
