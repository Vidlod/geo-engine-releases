"""geo-engine: núcleo determinista para maquetación de cursos en Moodle."""
from __future__ import annotations

from .config import load_config
from .findings import Finding
from .linter import FixResult, Linter, LintResult

__version__ = "0.1.0"
__all__ = ["Linter", "LintResult", "FixResult", "Finding", "load_config"]
