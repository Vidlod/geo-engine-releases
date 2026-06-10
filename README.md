# geo-engine

Núcleo determinista para maquetar cursos en Moodle (UDES). Convierte documentos
fuente en HTML que cumple las reglas del proyecto **sin depender de un LLM** para
las partes mecánicas.

> Plan completo y decisiones de arquitectura: [`docs/PLAN.md`](docs/PLAN.md).

## Estado

| Fase | Componente | Estado |
| :---: | --- | :---: |
| 1 | **Linter determinista** | ✅ Funcional |
| 2 | Motor de plantillas (parsers + templates) | ⬜ Pendiente |
| 3 | Skill de Claude (criterio) | ⬜ Pendiente |
| 4 | **Web app — GEO Engine Editor** | ✅ Funcional |

## Web App (Asistente + Editor Visual)

La web tiene dos modos desde la pantalla de inicio:

**1 · Asistente de curso** — el flujo GEO completo en 4 pasos:

```
01 Documentos   .docx → Markdown (Pandoc) · .pdf → Markdown (PyMuPDF4LLM)
02 Archivos RED registra los NOMBRES de los RED (no se suben los archivos)
03 Prompt       sección (Momento N / Entregable N / Glosario / Introducción)
                → genérico de skills/generic/ + documentos + lista RED → copiar
04 Resultado    pega el HTML de la IA → editor con linter
```

Los genéricos se embeben en el build directamente desde `skills/generic/*-prompt.md`
(fuente única). Si se agrega p. ej. `geo-glosario-prompt.md`, la sección Glosario
se habilita sola al recompilar.

**2 · Editor directo** — carga o pega un HTML existente para revisarlo.

```bash
# Servidor todo-en-uno (web compilada + API de conversión):
pip3 install -r requirements.txt   # Flask, pypandoc, pymupdf4llm, mammoth
cd web && npm install && npm run build && cd ..
python3 server.py                  # → http://127.0.0.1:5001

# Desarrollo del frontend (proxy /api → server.py en :5001):
cd web && npm run dev              # → http://localhost:3000
npm run smoke                      # smoke test del bundle (jsdom)
```

> Pandoc requiere el binario del sistema: `brew install pandoc`
> (o el .pkg oficial). pypandoc lo detecta automáticamente.

**Características del editor:**
- Carga archivos HTML con drag & drop o pegado directo
- Previsualización fiel con estilos de Moodle (Bootstrap)
- Edición inline: clic en texto → editar → la estructura HTML se preserva byte a byte
- Linter integrado (15 reglas portadas de Python a JS, check-only)
- Copiar HTML / Descargar archivo
- Dark mode con glassmorphism

## Instalación

El linter funciona **sin dependencias**. PyYAML es opcional (habilita `config/rules.yaml`):

```bash
pip install -r requirements.txt   # opcional
```

## Uso

```bash
# Revisar un archivo o una carpeta (recursivo), sin modificar nada:
python cli.py check ruta/al/archivo.html
python cli.py check "ruta/a/paginas_finales/"
python cli.py check archivo.html -v          # muestra fragmentos

# Autocorregir (vista previa por defecto, NO escribe):
python cli.py fix archivo.html
python cli.py fix archivo.html --write        # aplica y guarda
```

`check` devuelve código de salida ≠ 0 si hay errores (útil para validar antes de subir a Moodle).

## Reglas

Definidas en `geo_engine/rules/` y configurables en `config/rules.yaml`.

| id | Regla | Autofix |
| --- | --- | :---: |
| `max-br` | Máximo 2 `<br>` consecutivos | ✅ |
| `br-before-close` | Sin `<br>` antes de `</li>`/`</ul>`/`</ol>`/`</div>` | ✅ |
| `br-between-blocks` | Sin `<br>` entre bloques `p`/`ul`/`ol` (van consecutivos) | ✅ |
| `max-spaces` | Máximo 2 espacios consecutivos | ✅ |
| `terminology-module` | "módulo" → "curso" | ✅ |
| `emoticon-span` | `(y)`/`(x)` → `(<span>…</span>)` | ✅ |
| `link-target` | `<a>` con `target="_blank"` + `rel` (excepto `#`) | ✅ |
| `elibro-proxy` | Proxy eLibro con guion | ✅ |
| `tablero-anotaciones` | Elimina la frase prohibida | ✅ |
| `no-italics` | Quita `<em>` y `font-style:italic` | ✅ |
| `li-paragraph` | Detecta `<p>` dentro de `<li>` | detect |
| `li-period` | `<li>` de texto debe terminar en `.`/`:`/`?`/`!` | detect |
| `producto-final` | "Avance N" (último, de `course.yaml`) → "Producto Final" | ✅ |

> `producto-final` toma `last_avance` de `config/course.yaml` (requiere PyYAML). Sin ese
> dato la regla es inactiva. Es específica de cada curso.

Las pestañas de navegación Bootstrap (`nav-item` / `role="tab"`) se excluyen automáticamente
de las reglas de viñetas.

## Cómo añadir una regla nueva

1. Crea una clase en `geo_engine/rules/` que herede de `Rule` (ver `base.py`).
2. Implementa `check()` y, si aplica, `fix()` con `auto_fixable = True`.
3. Regístrala en `geo_engine/rules/__init__.py` (`ALL_RULES`).
4. Opcional: añade su config en `config/rules.yaml`.

No hay que tocar el orquestador ni el CLI.

## Tests

```bash
python tests/test_rules.py        # sin dependencias
# o, si tienes pytest:
python -m pytest
```
