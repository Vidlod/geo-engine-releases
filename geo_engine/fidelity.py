"""Comparador de fidelidad: AAA (origen) ↔ Momento HTML (salida).

Detecta párrafos del AAA que en el momento están:
  - PERDIDOS   — no aparecen en ningún lugar del momento
  - PARTIDOS   — un párrafo del AAA se dividió en varios <p> en el momento
  - FUSIONADOS — varios párrafos del AAA se unieron en un solo <p>
  - OK         — trasplantados 1:1 (con tolerancia a cambios de HTML/enlaces)

Uso desde CLI:
    python cli.py fidelity AAA.html momento.html
    python cli.py fidelity AAA.html momento.html --only errors

Limitaciones deliberadas:
  - Solo compara el TEXTO (ignora HTML); no verifica si los enlaces son correctos.
  - Las coincidencias son por similitud de texto (≥ umbral configurable), no regex.
  - No detecta párrafos AÑADIDOS en el momento que no existen en el AAA
    (sería demasiado ruidoso por los textos de bienvenida, botones, etc.).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from html.parser import HTMLParser
from typing import List, Optional, Tuple


# ────────────────────────────────────────────────────────────────
# Extracción de texto
# ────────────────────────────────────────────────────────────────

class _BlockExtractor(HTMLParser):
    """Extrae bloques de texto de los elementos de bloque (p, li, h2-h6, td)."""

    BLOCK_TAGS = {"p", "li", "h2", "h3", "h4", "h5", "h6", "td", "th"}
    SKIP_TAGS  = {"script", "style"}

    def __init__(self):
        super().__init__()
        self._depth = 0          # nivel de anidación dentro de un bloque
        self._current: list[str] = []
        self._blocks: list[str] = []
        self._skip = 0           # contador de tags a ignorar

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self._skip += 1
            return
        if tag in self.BLOCK_TAGS:
            if self._depth == 0:
                self._current = []
            self._depth += 1

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
            return
        if tag in self.BLOCK_TAGS and self._depth > 0:
            self._depth -= 1
            if self._depth == 0:
                text = _normalize(" ".join(self._current))
                if len(text) > 15:   # descarta fragmentos muy cortos
                    self._blocks.append(text)
                self._current = []

    def handle_data(self, data):
        if self._skip:
            return
        if self._depth > 0:
            self._current.append(data)

    @property
    def blocks(self) -> list[str]:
        return self._blocks


def _normalize(text: str) -> str:
    """Normaliza espacio y mayúsculas para comparación."""
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_blocks(html: str) -> List[str]:
    parser = _BlockExtractor()
    parser.feed(html)
    return parser.blocks


# ────────────────────────────────────────────────────────────────
# Comparación
# ────────────────────────────────────────────────────────────────

def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _best_match(needle: str, haystack: List[str]) -> Tuple[Optional[int], float]:
    best_i, best_score = None, 0.0
    for i, block in enumerate(haystack):
        # Si el needle está CONTENIDO en el bloque (o viceversa), cuenta como match.
        s = max(
            _similarity(needle, block),
            _similarity(needle, block[:len(needle) + 50]),
        )
        if needle in block or block in needle:
            s = max(s, 0.85)
        if s > best_score:
            best_score = s
            best_i = i
    return best_i, best_score


@dataclass
class FidelityIssue:
    kind: str           # "lost" | "split" | "merged" | "ok"
    source_text: str
    output_text: str = ""
    score: float = 0.0
    detail: str = ""

    @property
    def emoji(self) -> str:
        return {"lost": "❌", "split": "⚡", "merged": "🔀", "ok": "✅"}.get(self.kind, "?")


@dataclass
class FidelityResult:
    source_file: str
    output_file: str
    issues: List[FidelityIssue] = field(default_factory=list)

    @property
    def errors(self) -> List[FidelityIssue]:
        return [i for i in self.issues if i.kind in ("lost", "split", "merged")]

    @property
    def ok(self) -> List[FidelityIssue]:
        return [i for i in self.issues if i.kind == "ok"]


def _filter_blocks(blocks: List[str], min_len: int, skip_patterns: List[str]) -> List[str]:
    """Quita bloques demasiado cortos y encabezados/metadatos irrelevantes."""
    skip_re = re.compile("|".join(re.escape(p) for p in skip_patterns), re.IGNORECASE) if skip_patterns else None
    out = []
    for b in blocks:
        if len(b) < min_len:
            continue
        if skip_re and skip_re.search(b):
            continue
        out.append(b)
    return out


# Patrones que corresponden a secciones del AAA que NO van en los momentos.
_SKIP_PATTERNS = [
    "Agenda de avance de aprendizaje",
    "Identificación del curso",
    "Nombre del curso",
    "Recursos de reconocimiento del curso",
    "Recursos de consulta permanente",
    "Resultado de aprendizaje al que le aporta el curso",
    "Dimensiones del resultado de aprendizaje",
    "RESUMEN DE ENTREGAS",
    "NOMBRE DEL ENTREGABLE",
    "Duración semanas",
    "Semana de entrega",
    "Primer reporte de avance",
    "Segundo reporte de avances",
    "REALIMENTACIÓN GENERAL",
    "CIERRE DEL CURSO",
    "Control interno del documento",
    "Diseñador(a) instruccional",
    "Revisor(a) de estilo",
    "Revisión pedagógica",
    "Director (a) Coordinador",
    "Corrección estilo",
    "Diseño del curso",
    "Profesor disciplinar",
]


def compare(
    source_html: str,
    output_html: str,
    threshold_ok: float = 0.82,
    threshold_partial: float = 0.50,
    source_file: str = "",
    output_file: str = "",
    min_len: int = 60,
    skip_patterns: Optional[List[str]] = None,
) -> FidelityResult:
    """Compara bloques del source contra el output y clasifica cada uno."""
    skip = skip_patterns if skip_patterns is not None else _SKIP_PATTERNS
    src_blocks = _filter_blocks(extract_blocks(source_html), min_len=min_len, skip_patterns=skip)
    out_blocks = extract_blocks(output_html)

    result = FidelityResult(source_file=source_file, output_file=output_file)

    for src in src_blocks:
        best_i, best_score = _best_match(src, out_blocks)

        if best_score >= threshold_ok:
            result.issues.append(FidelityIssue(
                kind="ok", source_text=src,
                output_text=out_blocks[best_i] if best_i is not None else "",
                score=best_score,
            ))
        elif best_score >= threshold_partial:
            # ¿Es una fusión? El párrafo del source aparece como PARTE de un bloque mayor.
            if best_i is not None and len(out_blocks[best_i]) > len(src) * 1.5:
                kind = "merged"
                detail = "Posible fusión: el párrafo del AAA aparece dentro de un bloque más largo."
            else:
                kind = "split"
                detail = "Posible partición: el párrafo del AAA aparece dividido o re-escrito."
            result.issues.append(FidelityIssue(
                kind=kind, source_text=src,
                output_text=out_blocks[best_i] if best_i is not None else "",
                score=best_score, detail=detail,
            ))
        else:
            result.issues.append(FidelityIssue(
                kind="lost", source_text=src, score=best_score,
                detail="El párrafo del AAA no aparece en el momento HTML.",
            ))

    return result
