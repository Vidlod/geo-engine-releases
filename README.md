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
| 4 | Web app (compañeros no técnicos) | ⬜ Pendiente |

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
