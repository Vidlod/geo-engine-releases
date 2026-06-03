"""Regla anti-emoticonos de Moodle: (y)/(x) -> (<span>y</span>) (Regla 26)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from ..findings import Finding, SEVERITY_WARNING
from ..utils import line_at, snippet_at
from .base import Rule


class EmoticonRule(Rule):
    id = "emoticon-span"
    description = "Envuelve (y)/(x) en <span> para evitar el filtro de emoticonos de Moodle."
    severity = SEVERITY_WARNING
    auto_fixable = True

    def _regex(self):
        chars = self.options.get("chars", ["y", "x"])
        joined = "|".join(re.escape(c) for c in chars)
        # No re-envolver lo ya envuelto: el patrón busca el carácter literal entre paréntesis.
        return re.compile(r"\((%s)\)" % joined)

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        rx = self._regex()
        out: List[Finding] = []
        for m in rx.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                "(%s) puede convertirse en emoticono en Moodle." % m.group(1),
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        rx = self._regex()
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            ch = m.group(1)
            fixed.append(Finding(
                self.id, self.severity,
                "(%s) -> (<span>%s</span>)." % (ch, ch),
                line_at(html, m.start()), fixed=True,
            ))
            return "(<span>%s</span>)" % ch

        return rx.sub(_sub, html), fixed
