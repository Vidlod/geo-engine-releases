#!/usr/bin/env python3
"""GEO Engine — Conversión de PDF a Markdown.

Script independiente que convierte un archivo PDF a Markdown
utilizando la biblioteca pymupdf4llm (respeta columnas y tablas).

Uso:
    python3 convert_pdf.py <ruta_al_pdf>

La salida Markdown se escribe en stdout.
Los errores se escriben en stderr con código de salida 1.
"""

import sys


def main():
    """Punto de entrada principal del script de conversión."""
    if len(sys.argv) < 2:
        print("Error: se requiere la ruta al archivo PDF como argumento.", file=sys.stderr)
        print("Uso: python3 convert_pdf.py <ruta_al_pdf>", file=sys.stderr)
        sys.exit(1)

    ruta_pdf = sys.argv[1]

    try:
        import pymupdf4llm
    except ImportError:
        print(
            "Error: falta la dependencia pymupdf4llm.\n"
            "Instálala con: pip3 install pymupdf4llm",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        contenido_md = pymupdf4llm.to_markdown(ruta_pdf)
        sys.stdout.write(contenido_md)
    except FileNotFoundError:
        print(f"Error: no se encontró el archivo: {ruta_pdf}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error al convertir el PDF: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
