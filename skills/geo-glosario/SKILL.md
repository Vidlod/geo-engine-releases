---
name: geo-glosario
description: >-
  Usar al construir el Glosario HTML (tablas de verbos por dimensión) de un curso
  en Moodle (proyecto GEO / UDES) a partir del Excel de rúbrica. Cubre el orden
  alfabético, la estructura de tabla, los enlaces a la RAE, la capitalización de
  fuentes y los campos Concepto/Definición/Categoría de Moodle.
---

# Skill: Maquetación del Glosario (GEO)

Genera las tablas HTML del glosario de verbos, una por concepto, listas para
importar en la herramienta Glosario de Moodle.

## Antes de empezar: lee las reglas transversales

Lee `references/reglas-transversales.md` (regla de oro, FLAGS, enlaces y linter).

## Insumos

> **Insumo principal: la Rúbrica (.xlsx).** En el flujo de la app el glosario
> se construye SOLO con la rúbrica + `curso.yaml`; no leas otros archivos de
> `insumos/` salvo que la instrucción los liste explícitamente.

- El **Excel de rúbrica** con los verbos, dimensiones y, si aplica, fuentes.
- Las definiciones oficiales (RAE u otra fuente indicada en el Excel).

## Estructura de cada tabla

Una tabla por verbo, con clase estándar y SIN estilos inline en los `<td>`:

```html
<table class="table table-striped table-bordered">
    <tbody>
        <tr>
            <th style="text-align:center;">DIMENSIÓN</th>
            <th style="text-align:center;">VERBO</th>
            <th style="text-align:center;">ACEPCIÓN</th>
            <th style="text-align:center;">FUENTE</th>
        </tr>
        <tr>
            <td>Ser</td>
            <td>Analizar</td>
            <td>Estudiar o examinar algo, separando sus partes.</td>
            <td>María Moliner, Diccionario del uso del español, edición 1997.</td>
        </tr>
    </tbody>
</table>
<br>
<p></p>
```

- Cada tabla **termina exactamente** con `<br>` + nueva línea + `<p></p>`.
- Si la fuente es la RAE (u otro enlace), usa la misma tabla y enlaza en la columna
  FUENTE con `target="_blank" rel="noreferrer noopener"`.

## Reglas de criterio / formato

1. **Orden alfabético estricto** por VERBO (A→Z), sin importar la dimensión.
2. **Capitalización de FUENTE** (ni todo mayúsculas ni todo minúsculas):
   - Instituciones: solo iniciales en mayúscula → `Real Academia Española`.
   - Nombres: solo iniciales → `Omar Barbosa Santiago`.
3. **No dupliques títulos** dentro del HTML: Moodle genera el título del concepto.
4. **Verificación de enlaces RAE** antes de finalizar (que no estén caídos).

## Mapeo a los campos de Moodle

Al cargar cada verbo en la herramienta Glosario de Moodle:

- **Concepto** → solo el verbo con mayúscula inicial (p. ej. `Analizar`). Sin dimensión.
- **Definición** → el código HTML limpio de la tabla (sin títulos duplicados arriba).
- **Categorías** → la dimensión correspondiente: `SER`, `SABER` o `HACER`.

## Flags típicos

- `dato-faltante`: un verbo sin acepción o sin fuente en el Excel.
- `enlace-roto`: enlace RAE caído → buscar reemplazo o reportar.

## Hecho cuando

- [ ] Una tabla por verbo, orden alfabético A→Z.
- [ ] Estructura de tabla y cierre `<br>` + `<p></p>` correctos.
- [ ] Capitalización de fuentes aplicada.
- [ ] Enlaces RAE con `rel="noreferrer noopener"` y verificados.
- [ ] Indicado el mapeo Concepto / Definición / Categoría por verbo.
- [ ] `python cli.py check` sin errores.
- [ ] Lista de FLAGS entregada.
