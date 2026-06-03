#!/usr/bin/env python3
"""Interfaz de línea de comandos del linter geo-engine.

Ejemplos:
    python cli.py check ruta/al/archivo.html
    python cli.py check carpeta/                 # todos los .html (recursivo)
    python cli.py fix archivo.html               # vista previa (no escribe)
    python cli.py fix archivo.html --write       # aplica y guarda
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import List

from geo_engine import Linter, load_config
from geo_engine.findings import SEVERITY_ERROR, SEVERITY_WARNING

# Colores ANSI (se desactivan si la salida no es una terminal).
_TTY = sys.stdout.isatty()


def _c(text: str, code: str) -> str:
    return "\033[%sm%s\033[0m" % (code, text) if _TTY else text


def _sev_label(sev: str) -> str:
    if sev == SEVERITY_ERROR:
        return _c("error  ", "31")
    if sev == SEVERITY_WARNING:
        return _c("warning", "33")
    return _c("info   ", "36")


def collect_html_files(paths: List[str]) -> List[str]:
    files: List[str] = []
    for path in paths:
        if os.path.isdir(path):
            for root, _dirs, names in os.walk(path):
                for name in sorted(names):
                    if name.lower().endswith(".html"):
                        files.append(os.path.join(root, name))
        elif os.path.isfile(path):
            files.append(path)
        else:
            print(_c("No existe: %s" % path, "31"), file=sys.stderr)
    return files


def cmd_check(args) -> int:
    config = load_config(args.config)
    linter = Linter(config)
    files = collect_html_files(args.paths)
    total_err = total_warn = 0

    for filepath in files:
        with open(filepath, encoding="utf-8") as fh:
            html = fh.read()
        result = linter.check(html, filename=filepath)
        total_err += result.errors
        total_warn += result.warnings

        if not result.findings:
            print("%s %s" % (_c("OK", "32"), filepath))
            continue

        print("\n%s %s" % (_c("FILE", "1"), filepath))
        for f in result.findings:
            loc = _c("L%d" % f.line, "2") if f.line else _c("--", "2")
            print("  %-6s [%s] %s: %s" % (loc, _sev_label(f.severity), f.rule_id, f.message))
            if args.verbose and f.snippet:
                print("         %s" % _c(f.snippet, "2"))
        print("  %s" % _c("%d error(es), %d advertencia(s)" % (result.errors, result.warnings), "2"))

    print("\n%s %d archivo(s) — %s, %s" % (
        _c("TOTAL:", "1"), len(files),
        _c("%d error(es)" % total_err, "31" if total_err else "32"),
        _c("%d advertencia(s)" % total_warn, "33" if total_warn else "32"),
    ))
    return 1 if total_err else 0


def cmd_fix(args) -> int:
    config = load_config(args.config)
    linter = Linter(config)
    files = collect_html_files(args.paths)
    total_applied = 0

    for filepath in files:
        with open(filepath, encoding="utf-8") as fh:
            html = fh.read()
        result = linter.fix(html, filename=filepath)
        total_applied += len(result.applied)

        if not result.applied:
            print("%s %s" % (_c("sin cambios", "2"), filepath))
            continue

        action = "APLICADO" if args.write else "VISTA PREVIA"
        print("\n%s %s" % (_c(action, "1"), filepath))
        # Resumen por regla.
        by_rule: dict = {}
        for f in result.applied:
            by_rule[f.rule_id] = by_rule.get(f.rule_id, 0) + 1
        for rule_id, count in sorted(by_rule.items()):
            print("  %s %s: %d corrección(es)" % (_c("✓", "32"), rule_id, count))
        if result.remaining:
            print("  %s %d hallazgo(s) requieren revisión manual" % (
                _c("!", "33"), len(result.remaining)))

        if args.write:
            with open(filepath, "w", encoding="utf-8") as fh:
                fh.write(result.html)

    if not args.write and total_applied:
        print("\n%s Ejecuta con %s para guardar los cambios." % (
            _c("Nota:", "33"), _c("--write", "1")))
    print("\n%s %d corrección(es) en %d archivo(s)." % (
        _c("TOTAL:", "1"), total_applied, len(files)))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="geo-lint", description="Linter determinista de HTML para cursos Moodle (GEO).")
    parser.add_argument("--config", help="Ruta a rules.yaml (opcional).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_check = sub.add_parser("check", help="Reporta violaciones sin modificar.")
    p_check.add_argument("paths", nargs="+", help="Archivos o carpetas .html")
    p_check.add_argument("-v", "--verbose", action="store_true", help="Muestra fragmentos.")
    p_check.set_defaults(func=cmd_check)

    p_fix = sub.add_parser("fix", help="Aplica autocorrecciones seguras.")
    p_fix.add_argument("paths", nargs="+", help="Archivos o carpetas .html")
    p_fix.add_argument("--write", action="store_true", help="Guarda los cambios en disco.")
    p_fix.set_defaults(func=cmd_fix)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
