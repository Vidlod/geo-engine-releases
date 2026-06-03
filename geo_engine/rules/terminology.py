"""Regla de terminología: "módulo" -> "curso" (Regla 18 del proyecto)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from ..findings import Finding, SEVERITY_WARNING
from ..utils import line_at, snippet_at
from .base import Rule

_MODULE_RE = re.compile(r"\b[Mm]ódulos?\b")


def _replacement(match: "re.Match[str]") -> str:
    word = match.group(0)
    plural = word.lower().endswith("s")
    rep = "cursos" if plural else "curso"
    if word[0].isupper():
        rep = rep[0].upper() + rep[1:]
    return rep


class TerminologyRule(Rule):
    id = "terminology-module"
    description = 'Reemplaza "módulo/Módulo/módulos" por "curso/cursos".'
    severity = SEVERITY_WARNING
    auto_fixable = True

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        out: List[Finding] = []
        for m in _MODULE_RE.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                'Uso de "%s"; debería ser "%s".' % (m.group(0), _replacement(m)),
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            rep = _replacement(m)
            fixed.append(Finding(
                self.id, self.severity,
                '"%s" -> "%s".' % (m.group(0), rep),
                line_at(html, m.start()), fixed=True,
            ))
            return rep

        return _MODULE_RE.sub(_sub, html), fixed
