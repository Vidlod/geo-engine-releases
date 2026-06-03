"""Clase base para las reglas del linter."""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from ..findings import Finding


class Rule:
    """Una regla del linter.

    Subclasifica e implementa `check()`. Si la regla es autocorregible,
    define `auto_fixable = True` e implementa `fix()`.
    """

    id: str = ""
    description: str = ""
    severity: str = "warning"
    auto_fixable: bool = False

    def __init__(self, options: Dict[str, Any] | None = None):
        self.options = options or {}

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        """Devuelve los hallazgos sin modificar el HTML."""
        raise NotImplementedError

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        """Devuelve (html_corregido, hallazgos_corregidos). Por defecto no hace nada."""
        return html, []
