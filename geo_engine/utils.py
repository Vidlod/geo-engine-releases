"""Utilidades compartidas por las reglas del linter."""
from __future__ import annotations


def line_at(text: str, offset: int) -> int:
    """Número de línea (1-based) en `text` para una posición de carácter."""
    return text.count("\n", 0, offset) + 1


def snippet_at(text: str, start: int, end: int, context: int = 30) -> str:
    """Fragmento legible alrededor de [start, end), con saltos de línea visibles."""
    a = max(0, start - context)
    b = min(len(text), end + context)
    frag = text[a:b]
    frag = frag.replace("\n", "\\n").replace("\t", "\\t")
    if len(frag) > 120:
        frag = frag[:117] + "..."
    return frag.strip()


def deep_merge(a: dict, b: dict) -> dict:
    """Merge recursivo de `b` sobre `a` (devuelve un dict nuevo)."""
    out = dict(a)
    for key, value in b.items():
        if key in out and isinstance(out[key], dict) and isinstance(value, dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out
