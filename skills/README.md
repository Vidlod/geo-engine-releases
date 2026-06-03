# Skills GEO (multi-agente)

Skills para maquetar cada estructura de curso en Moodle, compatibles con
**Claude Code** y **Google Antigravity** (ambos usan el mismo formato `SKILL.md`).

## Filosofía

- **Fuente única**: las reglas transversales viven una sola vez en `_common/`.
- **Skills autocontenidas**: `build.py` copia `_common/` dentro de cada skill, para
  que funcionen aunque el agente no comparta contexto entre carpetas.
- **Degradación elegante**: cada skill se sostiene como guía de criterio; si el agente
  puede ejecutar shell, además invoca el **linter** (`../cli.py`) como red de seguridad.
- **El linter manda en lo mecánico**: las skills no replican las reglas de formato; las
  delega al linter (solo las resumen como respaldo para agentes sin shell).

## Skills disponibles

| Skill | Estructura | Tipo |
| --- | --- | --- |
| `geo-entregable` | Entregables / Avances | criterio |
| `geo-glosario` | Glosario de verbos | determinista |
| `geo-momento` | Momentos Evaluativos | criterio + tablas |
| `geo-linea-tiempo` | Línea del tiempo | determinista |

## Estructura

```
skills/
├── _common/
│   └── reglas-transversales.md     ← FUENTE ÚNICA (editar aquí)
├── geo-entregable/
│   ├── SKILL.md                    ← frontmatter name + description
│   └── references/
│       └── reglas-transversales.md ← copia sincronizada por build.py
├── geo-glosario/ ...
├── build.py                        ← sincroniza _common en cada skill
└── install.py                      ← instala en .claude/skills y .agent/skills
```

## Flujo de trabajo

```bash
# 1. Si editaste _common/, propaga a las skills:
python build.py
python build.py --check        # para CI: falla si hay desincronización

# 2. Instala en un proyecto (ambos agentes por defecto):
python install.py --target /ruta/al/proyecto
python install.py --target /ruta --agent claude       # solo Claude Code
python install.py --target /ruta --agent antigravity  # solo Antigravity
python install.py --target /ruta --link               # symlink (fuente única viva)
```

- **Claude Code** detecta las skills en `<proyecto>/.claude/skills/`.
- **Antigravity** las detecta en `<proyecto>/.agent/skills/`.
- En ambos, el agente las activa por la `description` del frontmatter (carga progresiva).

## Cómo añadir una skill nueva

1. Crea `skills/geo-<estructura>/SKILL.md` con frontmatter `name` + `description`.
2. Escribe el procedimiento y los flags propios de esa estructura.
3. `python build.py` (sincroniza las reglas transversales).
4. `python install.py --target ...`.
