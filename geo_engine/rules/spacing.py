"""Reglas de espaciado y saltos de línea (Reglas 9 y 10 del proyecto)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from ..findings import Finding, SEVERITY_ERROR, SEVERITY_WARNING
from ..utils import line_at, snippet_at
from .base import Rule


class MaxBrRule(Rule):
    id = "max-br"
    description = "No más de N <br> consecutivos."
    severity = SEVERITY_ERROR
    auto_fixable = True

    def _regex(self):
        mx = int(self.options.get("max", 1))
        return re.compile(r"(?:<br\s*/?>\s*){%d,}" % (mx + 1), re.IGNORECASE), mx

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        rx, mx = self._regex()
        out: List[Finding] = []
        for m in rx.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                "Más de %d <br> consecutivos." % mx,
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        rx, mx = self._regex()
        replacement = "<br>" * mx
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            fixed.append(Finding(
                self.id, self.severity,
                "Colapsado a %d <br>." % mx,
                line_at(html, m.start()), fixed=True,
            ))
            return replacement

        return rx.sub(_sub, html), fixed


class BrBeforeCloseRule(Rule):
    id = "br-before-close"
    description = "No debe haber <br> justo antes de cerrar li/ul/ol/div."
    severity = SEVERITY_ERROR
    auto_fixable = True

    def _regex(self):
        tags = self.options.get("tags", ["li", "ul", "ol", "div"])
        joined = "|".join(re.escape(t) for t in tags)
        return re.compile(
            r"(?:<br\s*/?>\s*)+(</(?:%s)>)" % joined, re.IGNORECASE
        )

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        rx = self._regex()
        out: List[Finding] = []
        for m in rx.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                "Salto(s) <br> antes de %s." % m.group(1),
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        rx = self._regex()
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            fixed.append(Finding(
                self.id, self.severity,
                "Eliminado <br> antes de %s." % m.group(1),
                line_at(html, m.start()), fixed=True,
            ))
            return m.group(1)

        return rx.sub(_sub, html), fixed


class BrBetweenBlocksRule(Rule):
    """Prohíbe <br> entre elementos de bloque (p/ul/ol): deben ir consecutivos.

    Moodle aplica margen CSS a los bloques; un <br> intermedio duplica el espacio.
    Acotada a p/ul/ol para NO afectar el <br><br> intencional que precede al <div>
    centrado del botón de envío.
    """

    id = "br-between-blocks"
    description = "Sin <br> entre bloques p/ul/ol (deben ir consecutivos)."
    severity = SEVERITY_ERROR
    auto_fixable = True

    def _regex(self):
        blocks = self.options.get("blocks", ["p", "ul", "ol"])
        joined = "|".join(re.escape(b) for b in blocks)
        return re.compile(
            r"(</(?:%s)>)(\s*(?:<br\s*/?>\s*)+)(<(?:%s)\b)" % (joined, joined),
            re.IGNORECASE,
        )

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        rx = self._regex()
        out: List[Finding] = []
        for m in rx.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                "Salto(s) <br> entre bloques (%s … %s); deben ir consecutivos."
                % (m.group(1), m.group(3) + ">"),
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        rx = self._regex()
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            fixed.append(Finding(
                self.id, self.severity,
                "Eliminado <br> entre %s y %s." % (m.group(1), m.group(3) + ">"),
                line_at(html, m.start()), fixed=True,
            ))
            return m.group(1) + m.group(3)

        return rx.sub(_sub, html), fixed


class BrBeforeButtonRule(Rule):
    """Prohíbe <br> antes del <div> centrado del botón de envío (Regla 28 del proyecto).

    El botón va directo tras el último párrafo (margen nativo). Detecta y elimina
    los <br> que precedan a un `<div ... text-align: center ...>`.
    """

    id = "br-before-button"
    description = "Sin <br> antes del <div> centrado del botón de envío."
    severity = SEVERITY_ERROR
    auto_fixable = True

    _RE = re.compile(
        r"(?:<br\s*/?>\s*)+(<div[^>]*text-align:\s*center[^>]*>)", re.IGNORECASE
    )

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        out: List[Finding] = []
        for m in self._RE.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                "Salto(s) <br> antes del <div> centrado del botón; debe ir directo.",
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            fixed.append(Finding(
                self.id, self.severity,
                "Eliminado <br> antes del <div> del botón.",
                line_at(html, m.start()), fixed=True,
            ))
            return m.group(1)

        return self._RE.sub(_sub, html), fixed


class MaxSpacesRule(Rule):
    id = "max-spaces"
    description = "No más de N espacios consecutivos (sin contar la indentación)."
    severity = SEVERITY_WARNING
    auto_fixable = True

    def _regex(self):
        mx = int(self.options.get("max", 2))
        # (?<=\S) evita tocar la indentación al inicio de línea.
        return re.compile(r"(?<=\S) {%d,}" % (mx + 1)), mx

    def check(self, html: str, ctx: Dict[str, Any]) -> List[Finding]:
        rx, mx = self._regex()
        out: List[Finding] = []
        for m in rx.finditer(html):
            out.append(Finding(
                self.id, self.severity,
                "Más de %d espacios consecutivos." % mx,
                line_at(html, m.start()), snippet_at(html, m.start(), m.end()),
            ))
        return out

    def fix(self, html: str, ctx: Dict[str, Any]) -> Tuple[str, List[Finding]]:
        rx, mx = self._regex()
        replacement = " " * mx
        fixed: List[Finding] = []

        def _sub(m: "re.Match[str]") -> str:
            fixed.append(Finding(
                self.id, self.severity,
                "Colapsado a %d espacios." % mx,
                line_at(html, m.start()), fixed=True,
            ))
            return replacement

        return rx.sub(_sub, html), fixed
