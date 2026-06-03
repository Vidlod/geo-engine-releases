#!/usr/bin/env python3
"""Sincroniza los archivos compartidos de `_common/` dentro de cada skill.

Cada skill debe ser autocontenida (para funcionar en cualquier agente), pero la
fuente de verdad de las reglas transversales vive una sola vez en `_common/`.
Este script copia `_common/*.md` a `<skill>/references/` de cada skill `geo-*`.

Uso:
    python build.py            # sincroniza
    python build.py --check    # falla si algo está desincronizado (para CI)
"""
from __future__ import annotations

import argparse
import filecmp
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
COMMON = os.path.join(HERE, "_common")


def skill_dirs():
    for name in sorted(os.listdir(HERE)):
        path = os.path.join(HERE, name)
        if name.startswith("geo-") and os.path.isdir(path):
            yield name, path


def common_files():
    return [f for f in sorted(os.listdir(COMMON)) if f.endswith(".md")]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Sincroniza _common en cada skill.")
    parser.add_argument("--check", action="store_true",
                        help="Solo verifica; sale con código 1 si hay desincronización.")
    args = parser.parse_args(argv)

    files = common_files()
    out_of_sync = []
    synced = 0

    for name, path in skill_dirs():
        refs = os.path.join(path, "references")
        os.makedirs(refs, exist_ok=True)
        for fname in files:
            src = os.path.join(COMMON, fname)
            dst = os.path.join(refs, fname)
            same = os.path.exists(dst) and filecmp.cmp(src, dst, shallow=False)
            if args.check:
                if not same:
                    out_of_sync.append("%s/references/%s" % (name, fname))
            elif not same:
                shutil.copy2(src, dst)
                print("  sync  %s/references/%s" % (name, fname))
                synced += 1

    if args.check:
        if out_of_sync:
            print("DESINCRONIZADO:")
            for item in out_of_sync:
                print("  - %s" % item)
            print("Ejecuta: python build.py")
            return 1
        print("OK: todas las skills están sincronizadas.")
        return 0

    print("Listo: %d archivo(s) sincronizado(s) en %d skill(s)." %
          (synced, len(list(skill_dirs()))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
