#!/usr/bin/env python3
"""Instala las skills GEO en un proyecto, para Claude Code y/o Antigravity.

- Claude Code:  <target>/.claude/skills/<skill>/
- Antigravity:  <target>/.agent/skills/<skill>/

El formato SKILL.md es compatible con ambos agentes; solo cambia la carpeta destino.

Uso:
    python install.py --target /ruta/al/proyecto                 # ambos agentes (copia)
    python install.py --target /ruta --agent claude              # solo Claude Code
    python install.py --target /ruta --agent antigravity         # solo Antigravity
    python install.py --target /ruta --link                      # symlink (fuente única viva)
"""
from __future__ import annotations

import argparse
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))

AGENT_DIRS = {
    "claude": os.path.join(".claude", "skills"),
    "antigravity": os.path.join(".agent", "skills"),
}


def skill_dirs():
    for name in sorted(os.listdir(HERE)):
        path = os.path.join(HERE, name)
        if name.startswith("geo-") and os.path.isdir(path):
            yield name, path


def install_one(src: str, dst: str, link: bool):
    if os.path.islink(dst) or os.path.isfile(dst):
        os.remove(dst)
    elif os.path.isdir(dst):
        shutil.rmtree(dst)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if link:
        os.symlink(src, dst)
    else:
        shutil.copytree(src, dst)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Instala las skills GEO en un proyecto.")
    parser.add_argument("--target", required=True, help="Raíz del proyecto destino.")
    parser.add_argument("--agent", choices=["claude", "antigravity", "both"],
                        default="both", help="Agente(s) destino (por defecto: ambos).")
    parser.add_argument("--link", action="store_true",
                        help="Crear symlinks en vez de copiar (mantiene fuente única).")
    args = parser.parse_args(argv)

    target = os.path.abspath(args.target)
    if not os.path.isdir(target):
        print("El destino no existe: %s" % target)
        return 1

    agents = ["claude", "antigravity"] if args.agent == "both" else [args.agent]
    skills = list(skill_dirs())
    if not skills:
        print("No hay skills geo-* para instalar. ¿Corriste build.py?")
        return 1

    total = 0
    for agent in agents:
        base = os.path.join(target, AGENT_DIRS[agent])
        for name, src in skills:
            dst = os.path.join(base, name)
            install_one(src, dst, args.link)
            mode = "link" if args.link else "copy"
            print("  [%s/%s] %s -> %s" % (agent, mode, name, dst))
            total += 1

    print("Listo: %d skill(s) instalada(s) en %s." % (total, ", ".join(agents)))
    print("Recuerda correr 'python build.py' antes si editaste _common/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
