"""Regla anti-cursiva (Regla 2 del proyecto: el texto nunca va en cursiva).

Autocorrige `<em>` y `font-style: italic`. Los `<i>` se reportan como advertencia
pero NO se eliminan por defecto, porque suelen usarse como íconos (Bootstrap/Font
Awesome) y borrarlos rompería la interfaz. Configurable con `remove_i: true`.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from ..findings import Finding, SEVERITY_WARNING
from ..utils import line_at, snippet_at
from .base import Rule

_EM_RE = re.compile(r"</?em\b[^>]*>", re.IGNORECASE)
_I_RE = re.compile(r"</?i\b[^>]*>", re.IGNORECASE)
_ITALIC_STYLE_RE = re.compile(r"font-style\s*:\s*italic\s*;?", re.IGNORECASE)


class NoItalicsRule(Rule):
    id = "no-italics"
    description = "Sin cursiva: quita <em> y font-style:italic; advierte sobre <i>."
    severity = SEVERITY_WARNING
    auto_fixable = True

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        out: List[Finding] = []
        for m in _EM_RE.finditer(html):
            out.append(Finding(
                self.id, self.severity, "Etiqueta <em> (cursiva) no permitida.",
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        for m in _ITALIC_STYLE_RE.finditer(html):
            out.append(Finding(
                self.id, self.severity, "Estilo font-style:italic no permitido.",
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        if self.options.get("remove_i", False):
            for m in _I_RE.finditer(html):
                out.append(Finding(
                    self.id, self.severity, "Etiqueta <i> (cursiva) no permitida.",
                    line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
                ))
        else:
            for m in _I_RE.finditer(html):
                out.append(Finding(
                    self.id, SEVERITY_WARNING,
                    "Etiqueta <i> detectada (¿cursiva o ícono?): revisar manualmente.",
                    line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
                ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        fixed: List[Finding] = []
        n_em = len(_EM_RE.findall(html))
        if n_em:
            html = _EM_RE.sub("", html)
            fixed.append(Finding(self.id, self.severity,
                                 "Quitadas %d etiqueta(s) <em>." % n_em, fixed=True))
        n_style = len(_ITALIC_STYLE_RE.findall(html))
        if n_style:
            html = _ITALIC_STYLE_RE.sub("", html)
            fixed.append(Finding(self.id, self.severity,
                                 "Quitado font-style:italic (%d)." % n_style, fixed=True))
        if self.options.get("remove_i", False):
            n_i = len(_I_RE.findall(html))
            if n_i:
                html = _I_RE.sub("", html)
                fixed.append(Finding(self.id, self.severity,
                                     "Quitadas %d etiqueta(s) <i>." % n_i, fixed=True))
        return html, fixed
