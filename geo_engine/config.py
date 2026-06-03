"""Carga de configuración del linter.

Usa `config/rules.yaml` si PyYAML está disponible; de lo contrario emplea los
defaults embebidos, de modo que el linter funcione sin instalar dependencias.
"""
from __future__ import annotations

import os

from .utils import deep_merge

DEFAULT_CONFIG = {
    "rules": {
        "max-br": {"enabled": True, "max": 2},
        "br-before-close": {"enabled": True, "tags": ["li", "ul", "ol", "div"]},
        "br-between-blocks": {"enabled": True, "blocks": ["p", "ul", "ol"]},
        "max-spaces": {"enabled": True, "max": 2},
        "terminology-module": {"enabled": True},
        "emoticon-span": {"enabled": True, "chars": ["y", "x"]},
        "link-target": {"enabled": True, "rel": "noopener"},
        "elibro-proxy": {"enabled": True},
        "tablero-anotaciones": {"enabled": True},
        "no-italics": {"enabled": True, "remove_i": False},
        "li-paragraph": {"enabled": True},
        "li-period": {"enabled": True, "endings": [".", ":", "?", "!"]},
        # last_avance se inyecta desde config/course.yaml; sin él, la regla es no-op.
        "producto-final": {
            "enabled": True,
            "last_avance": None,
            "case_insensitive": False,
            "replacement": "Producto Final",
        },
    }
}


def load_config(path: str | None = None, course_path: str | None = None) -> dict:
    """Devuelve la config combinando defaults + rules.yaml + datos de course.yaml."""
    config = deep_merge({}, DEFAULT_CONFIG)
    if not path:
        # Buscar config/rules.yaml relativo a la raíz del proyecto.
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        candidate = os.path.join(here, "config", "rules.yaml")
        if os.path.exists(candidate):
            path = candidate
    if path and os.path.exists(path):
        try:
            import yaml  # type: ignore

            with open(path, encoding="utf-8") as fh:
                user = yaml.safe_load(fh) or {}
            config = deep_merge(config, user)
        except ImportError:
            # PyYAML no instalado: se usan los defaults silenciosamente.
            pass

    _inject_course_data(config, course_path)
    return config


def _inject_course_data(config: dict, course_path: str | None = None) -> None:
    """Inyecta datos por curso (de course.yaml) en las reglas que los necesitan.

    Hoy: `course.last_avance` -> opción `last_avance` de la regla `producto-final`.
    Si rules.yaml ya fijó un `last_avance`, se respeta (no se sobrescribe).
    """
    if not course_path:
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        candidate = os.path.join(here, "config", "course.yaml")
        course_path = candidate if os.path.exists(candidate) else None
    if not course_path or not os.path.exists(course_path):
        return
    try:
        import yaml  # type: ignore

        with open(course_path, encoding="utf-8") as fh:
            data = (yaml.safe_load(fh) or {}).get("course", {})
    except ImportError:
        return
    last_avance = data.get("last_avance")
    pf = config.setdefault("rules", {}).setdefault("producto-final", {})
    if last_avance is not None and pf.get("last_avance") is None:
        pf["last_avance"] = last_avance
