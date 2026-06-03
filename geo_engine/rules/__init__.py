"""Registro de reglas del linter.

Para añadir una regla nueva: créala en un módulo de este paquete y agrégala a
`ALL_RULES`. Nada más necesita cambiar.
"""
from __future__ import annotations

from .base import Rule
from .citations import NoItalicsRule
from .emoticons import EmoticonRule
from .links import ElibroProxyRule, LinkTargetRule
from .lists import ListItemPeriodRule, ParagraphInListRule
from .naming import ProductoFinalRule
from .phrases import TableroAnotacionesRule
from .spacing import (
    BrBeforeButtonRule,
    BrBeforeCloseRule,
    BrBetweenBlocksRule,
    MaxBrRule,
    MaxSpacesRule,
)
from .terminology import TerminologyRule

ALL_RULES = [
    MaxBrRule,
    BrBeforeCloseRule,
    BrBetweenBlocksRule,
    BrBeforeButtonRule,
    MaxSpacesRule,
    TerminologyRule,
    EmoticonRule,
    LinkTargetRule,
    ElibroProxyRule,
    TableroAnotacionesRule,
    NoItalicsRule,
    ParagraphInListRule,
    ListItemPeriodRule,
    ProductoFinalRule,
]

__all__ = ["Rule", "ALL_RULES"]
