"""Eliminación de la frase "tablero de anotaciones" (Regla 12 del proyecto)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from ..findings import Finding, SEVERITY_WARNING
from ..utils import line_at, snippet_at
from .base import Rule

# Captura el espacio previo para no dejar dobles espacios al eliminar la frase.
_TABLERO_RE = re.compile(
    r"\s*(?:a través del|en el)\s+tablero de anotaciones", re.IGNORECASE
)


class TableroAnotacionesRule(Rule):
    id = "tablero-anotaciones"
    description = 'Elimina "a través del / en el tablero de anotaciones".'
    severity = SEVERITY_WARNING
    auto_fixable = True

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        out: List[Finding] = []
        for m in _TABLERO_RE.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                "Referencia prohibida al tablero de anotaciones.",
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            fixed.append(Finding(
                self.id, self.severity,
                "Eliminada referencia al tablero de anotaciones.",
                line_at(html, m.start()), fixed=True,
            ))
            return ""

        return _TABLERO_RE.sub(_sub, html), fixed
