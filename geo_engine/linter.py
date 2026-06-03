"""Orquestador del linter: carga reglas activas y ejecuta check/fix."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from .findings import Finding, SEVERITY_ERROR, SEVERITY_WARNING
from .rules import ALL_RULES


@dataclass
class LintResult:
    filename: str
    findings: List[Finding] = field(default_factory=list)

    @property
    def errors(self) -> int:
        return sum(1 for f in self.findings if f.severity == SEVERITY_ERROR)

    @property
    def warnings(self) -> int:
        return sum(1 for f in self.findings if f.severity == SEVERITY_WARNING)


@dataclass
class FixResult:
    filename: str
    html: str
    applied: List[Finding] = field(default_factory=list)
    remaining: List[Finding] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return len(self.applied) > 0


class Linter:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.rules = self._load_rules()

    def _load_rules(self):
        rules_cfg = self.config.get("rules", {})
        active = []
        for cls in ALL_RULES:
            cfg = rules_cfg.get(cls.id, {})
            if cfg.get("enabled", True):
                active.append(cls(options=cfg))
        return active

    def check(self, html: str, filename: str = "") -> LintResult:
        ctx = {"config": self.config, "filename": filename}
        findings: List[Finding] = []
        for rule in self.rules:
            findings.extend(rule.check(html, ctx))
        findings.sort(key=lambda f: f.sort_key())
        return LintResult(filename=filename, findings=findings)

    def fix(self, html: str, filename: str = "") -> FixResult:
        ctx = {"config": self.config, "filename": filename}
        applied: List[Finding] = []
        for rule in self.rules:
            if rule.auto_fixable:
                html, fixed = rule.fix(html, ctx)
                applied.extend(fixed)
        remaining = self.check(html, filename).findings
        return FixResult(filename=filename, html=html, applied=applied, remaining=remaining)
