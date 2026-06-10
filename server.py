"""GEO Engine — servidor local.

Une las dos piezas del flujo en un solo proceso:
  1. API de conversión de documentos (/api/convert):
       .docx → Markdown (Pandoc)   [motor por defecto]
       .docx → HTML     (mammoth)  [motor alternativo, trasplante 1:1]
       .pdf  → Markdown (PyMuPDF4LLM, respeta columnas y tablas)
  2. La web app compilada (web/dist): asistente + editor + linter.

Uso:
    cd web && npm run build && cd ..   # compilar la web (una vez, o tras cambios)
    python3 server.py                  # abre http://127.0.0.1:5001

Las dependencias de conversión son opcionales: si falta alguna, el endpoint
responde 503 con la instrucción de instalación en lugar de tumbar el servidor.
"""
from __future__ import annotations

import io
import os
import sys
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "web" / "dist"

app = Flask(__name__, static_folder=str(DIST), static_url_path="")

ALLOWED_EXTS = {".docx", ".pdf"}


# ────────────────────────────────────────────────────────────────
# Motores de conversión (imports perezosos)
# ────────────────────────────────────────────────────────────────

def _convert_pandoc(tmp_path: str) -> str:
    try:
        import pypandoc
    except ImportError:
        raise RuntimeError("Falta pypandoc: pip3 install pypandoc") from None
    # gfm = GitHub-Flavored Markdown: tablas con pipes, más legible para la IA.
    return pypandoc.convert_file(tmp_path, "gfm", extra_args=["--wrap=none"])


def _convert_pymupdf(tmp_path: str) -> str:
    try:
        import pymupdf4llm
    except ImportError:
        raise RuntimeError("Falta pymupdf4llm: pip3 install pymupdf4llm") from None
    return pymupdf4llm.to_markdown(tmp_path)


def _convert_mammoth(file_bytes: bytes) -> tuple[str, list[str]]:
    try:
        import mammoth
    except ImportError:
        raise RuntimeError("Falta mammoth: pip3 install mammoth") from None
    result = mammoth.convert_to_html(io.BytesIO(file_bytes))
    return result.value, [m.message for m in result.messages]


# ────────────────────────────────────────────────────────────────
# API
# ────────────────────────────────────────────────────────────────

@app.post("/api/convert")
def convert():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"error": "No se subió ningún archivo"}), 400

    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        return jsonify({"error": "Tipo de archivo no permitido. Debe ser .docx o .pdf"}), 400

    engine = request.form.get("engine", "auto")
    if ext == ".pdf":
        engine = "pymupdf4llm"
    elif engine not in ("pandoc", "mammoth"):
        engine = "pandoc"

    try:
        if engine == "mammoth":
            html, warnings = _convert_mammoth(file.read())
            return jsonify({
                "filename": filename, "engine": engine,
                "format": "html", "content": html, "warnings": warnings,
            })

        # Pandoc y PyMuPDF4LLM trabajan sobre archivo en disco.
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        try:
            if engine == "pandoc":
                content = _convert_pandoc(tmp_path)
            else:
                content = _convert_pymupdf(tmp_path)
        finally:
            os.unlink(tmp_path)

        return jsonify({
            "filename": filename, "engine": engine,
            "format": "markdown", "content": content, "warnings": [],
        })

    except RuntimeError as e:          # dependencia faltante
        return jsonify({"error": str(e)}), 503
    except Exception as e:             # fallo del motor
        return jsonify({"error": f"Fallo al procesar con {engine}: {e}"}), 500


# ────────────────────────────────────────────────────────────────
# Web app estática (web/dist)
# ────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    if not (DIST / "index.html").exists():
        return (
            "<h1>GEO Engine</h1><p>La web no está compilada. Ejecuta:</p>"
            "<pre>cd web && npm install && npm run build</pre>",
            200,
        )
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    print("GEO Engine — http://127.0.0.1:5001")
    app.run(host="127.0.0.1", port=5001, debug=True)
