"""Regla de nomenclatura "Producto Final" (Reglas del proyecto, sección 7 transversal).

El último avance del último momento se renombra globalmente a "Producto Final".
El número del último avance es propio de cada curso y se toma de la config
(`last_avance`, normalmente inyectado desde `config/course.yaml`). Si no hay
`last_avance`, la regla no hace nada (no-op seguro).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from ..findings import Finding, SEVERITY_ERROR
from ..utils import line_at, snippet_at
from .base import Rule


class ProductoFinalRule(Rule):
    id = "producto-final"
    description = 'El último avance ("Avance N") se renombra a "Producto Final".'
    severity = SEVERITY_ERROR
    auto_fixable = True

    def _regex(self):
        n = self.options.get("last_avance")
        if not n:
            return None
        flags = re.IGNORECASE if self.options.get("case_insensitive", False) else 0
        # \b tras el número evita falsos positivos como "Avance 52".
        return re.compile(r"\bAvance\s+%d\b" % int(n), flags)

    def _replacement(self) -> str:
        return self.options.get("replacement", "Producto Final")

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        rx = self._regex()
        if rx is None:
            return []
        rep = self._replacement()
        out: List[Finding] = []
        for m in rx.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                '"%s" debe ser "%s".' % (m.group(0), rep),
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        rx = self._regex()
        if rx is None:
            return html, []
        rep = self._replacement()
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            fixed.append(Finding(
                self.id, self.severity,
                '"%s" -> "%s".' % (m.group(0), rep),
                line_at(html, m.start()), fixed=True,
            ))
            return rep

        return rx.sub(_sub, html), fixed
