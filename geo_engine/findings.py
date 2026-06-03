"""Modelo de hallazgos (findings) del linter."""
from __future__ import annotations

from dataclasses import dataclass

SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"
SEVERITY_INFO = "info"

_SEVERITY_ORDER = {SEVERITY_ERROR: 0, SEVERITY_WARNING: 1, SEVERITY_INFO: 2}


@dataclass
class Finding:
    """Un hallazgo individual producido por una regla."""

    rule_id: str
    severity: str
    message: str
    line: int = 0
    snippet: str = ""
    fixed: bool = False

    def sort_key(self):
        return (self.line, _SEVERITY_ORDER.get(self.severity, 9), self.rule_id)
