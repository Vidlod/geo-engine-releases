"""Reglas de enlaces: target/rel obligatorios y proxy eLibro (Reglas 14 y 15)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from ..findings import Finding, SEVERITY_WARNING
from ..utils import line_at, snippet_at
from .base import Rule

_A_RE = re.compile(r"<a\b([^>]*)>", re.IGNORECASE)
_HREF_RE = re.compile(r'href\s*=\s*"(.*?)"', re.IGNORECASE)
_TARGET_RE = re.compile(r'target\s*=', re.IGNORECASE)
_REL_RE = re.compile(r'rel\s*=', re.IGNORECASE)


class LinkTargetRule(Rule):
    id = "link-target"
    description = 'Los <a> (salvo ancla #) deben tener target="_blank" y rel.'
    severity = SEVERITY_WARNING
    auto_fixable = True

    def _missing(self, attrs: str):
        """Devuelve (skip, falta_target, falta_rel) para los atributos de un <a>."""
        href = _HREF_RE.search(attrs)
        if href is not None and href.group(1).strip().startswith("#"):
            return True, False, False
        return False, _TARGET_RE.search(attrs) is None, _REL_RE.search(attrs) is None

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        out: List[Finding] = []
        for m in _A_RE.finditer(html):
            skip, no_target, no_rel = self._missing(m.group(1))
            if skip or not (no_target or no_rel):
                continue
            faltan = []
            if no_target:
                faltan.append('target="_blank"')
            if no_rel:
                faltan.append("rel")
            out.append(Finding(
                self.id, self.severity,
                "Enlace sin %s." % " y ".join(faltan),
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        rel_value = self.options.get("rel", "noopener")
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            attrs = m.group(1)
            skip, no_target, no_rel = self._missing(attrs)
            if skip or not (no_target or no_rel):
                return m.group(0)
            additions = ""
            if no_target:
                additions += ' target="_blank"'
            if no_rel:
                additions += ' rel="%s"' % rel_value
            fixed.append(Finding(
                self.id, self.severity,
                "Añadido%s al enlace." % additions,
                line_at(html, m.start()), fixed=True,
            ))
            return "<a" + attrs.rstrip() + additions + ">"

        return _A_RE.sub(_sub, html), fixed


class ElibroProxyRule(Rule):
    id = "elibro-proxy"
    description = "El proxy eLibro debe llevar guion: elibro-net.ezproxy.udes.edu.co."
    severity = SEVERITY_WARNING
    auto_fixable = True

    _BAD = "elibronet.ezproxy.udes.edu.co"
    _GOOD = "elibro-net.ezproxy.udes.edu.co"

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        out: List[Finding] = []
        start = 0
        while True:
            idx = html.find(self._BAD, start)
            if idx == -1:
                break
            out.append(Finding(
                self.id, self.severity,
                "Proxy eLibro sin guion (fallará en la red institucional).",
                line_at(html, idx), snippet_at(html, idx, idx + len(self._BAD)),
            ))
            start = idx + len(self._BAD)
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        if self._BAD not in html:
            return html, []
        count = html.count(self._BAD)
        fixed = [Finding(
            self.id, self.severity,
            "Corregido proxy eLibro (%d ocurrencia(s))." % count, fixed=True,
        )]
        return html.replace(self._BAD, self._GOOD), fixed
