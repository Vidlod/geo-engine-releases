"""Reglas de viñetas (Regla 4 del proyecto). Solo detección (requieren criterio)."""
from __future__ import annotations

import re
from typing import Any, Dict, List

from ..findings import Finding, SEVERITY_ERROR, SEVERITY_WARNING
from ..utils import line_at, snippet_at
from .base import Rule

# Captura los atributos del <li> (grupo 1) y su contenido interno (grupo 2).
_LI_RE = re.compile(r"<li\b([^>]*)>(.*?)</li>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_MEDIA_RE = re.compile(r"<(?:audio|button|img|iframe|video)\b", re.IGNORECASE)
# Pestañas de navegación Bootstrap: no son viñetas de contenido.
_NAV_LI_RE = re.compile(r"nav-item|nav-link", re.IGNORECASE)
_TAB_ANCHOR_RE = re.compile(
    r'role\s*=\s*"tab"|data-(?:bs-)?toggle\s*=\s*"tab"|class\s*=\s*"[^"]*nav-link',
    re.IGNORECASE,
)


def _is_nav_item(attrs: str, inner: str) -> bool:
    return bool(_NAV_LI_RE.search(attrs) or _TAB_ANCHOR_RE.search(inner))


class ParagraphInListRule(Rule):
    """Detecta <p> anidado dentro de <li> (prohibido). No autocorrige."""

    id = "li-paragraph"
    description = "No combinar <p> dentro de <li>."
    severity = SEVERITY_ERROR
    auto_fixable = False

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        out: List[Finding] = []
        for m in _LI_RE.finditer(html):
            attrs, inner = m.group(1), m.group(2)
            if _is_nav_item(attrs, inner):
                continue
            if re.search(r"<p\b", inner, re.IGNORECASE):
                out.append(Finding(
                    self.id, self.severity,
                    "Etiqueta <p> dentro de <li> (prohibido).",
                    line_at(html, m.start()), snippet_at(html, m.start(), m.start() + 60),
                ))
        return out


class ListItemPeriodRule(Rule):
    """Cada <li> de texto debe terminar con un signo de cierre. Solo detección.

    Se excluyen los ítems multimedia y las pestañas de navegación (nav-item).
    """

    id = "li-period"
    description = "Punto final obligatorio en cada <li> de texto."
    severity = SEVERITY_WARNING
    auto_fixable = False

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        endings = tuple(self.options.get("endings", [".", ":", "?", "!"]))
        out: List[Finding] = []
        for m in _LI_RE.finditer(html):
            attrs, inner = m.group(1), m.group(2)
            if _is_nav_item(attrs, inner) or _MEDIA_RE.search(inner):
                continue
            text = _TAG_RE.sub("", inner).replace("&nbsp;", " ").strip()
            if not text:
                continue
            if not text.endswith(endings):
                out.append(Finding(
                    self.id, self.severity,
                    "El <li> no termina en signo de cierre (%r)." % text[-40:],
                    line_at(html, m.start()), snippet_at(html, m.start(), m.start() + 60),
                ))
        return out
