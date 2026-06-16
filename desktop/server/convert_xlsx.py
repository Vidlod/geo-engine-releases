#!/usr/bin/env python3
"""
Convierte un .xlsx a texto tabulado legible (Markdown simple) usando SOLO la
biblioteca estándar (zipfile + xml): sin dependencias externas.

Uso:
    python3 convert_xlsx.py <ruta_al_xlsx>

Imprime por stdout una sección por hoja:

    ## NombreDeHoja
    celda1 | celda2 | celda3
    ...
"""
import sys
import zipfile
import re
from xml.etree import ElementTree as ET

def get_namespace(element):
    m = re.match(r'(\{.*?\})', element.tag)
    return m.group(1) if m else ''

def get_local_attr(element, local_name):
    local_name_lower = local_name.lower()
    for k, v in element.attrib.items():
        attr_name = k.split('}')[-1].lower()
        if attr_name == local_name_lower:
            return v
    return None

def col_index(cell_ref):
    """'C7' → 2 (índice de columna base 0)."""
    letters = re.match(r'([A-Z]+)', (cell_ref or '').upper())
    if not letters:
        return 0
    idx = 0
    for ch in letters.group(1):
        idx = idx * 26 + (ord(ch) - 64)
    return idx - 1


def shared_strings(zf):
    """Lista de cadenas compartidas (sharedStrings.xml), si existe."""
    try:
        data = zf.read('xl/sharedStrings.xml')
    except KeyError:
        return []
    try:
        root = ET.fromstring(data)
    except Exception:
        return []
    ns = get_namespace(root)
    out = []
    for si in root.findall(f'{ns}si'):
        # Une todos los nodos <t> (texto plano y rich text)
        out.append(''.join(t.text or '' for t in si.iter(f'{ns}t')))
    return out


def sheet_files(zf):
    """[(nombre_de_hoja, ruta_en_zip)] en el orden del libro."""
    try:
        wb_data = zf.read('xl/workbook.xml')
        rels_data = zf.read('xl/_rels/workbook.xml.rels')
    except KeyError:
        return []
    try:
        wb = ET.fromstring(wb_data)
        rels = ET.fromstring(rels_data)
    except Exception:
        return []
        
    ns = get_namespace(wb)
    targets = {}
    for rel in rels:
        target = rel.get('Target') or ''
        if target.startswith('/'):
            target = target.lstrip('/')
        elif not target.startswith('xl/'):
            target = 'xl/' + target
        rid = get_local_attr(rel, 'Id')
        if rid:
            targets[rid] = target
            
    sheets = []
    for sh in wb.iter(f'{ns}sheet'):
        rid = get_local_attr(sh, 'id')
        if rid in targets:
            sheets.append((sh.get('name') or 'Hoja', targets[rid]))
    return sheets


def cell_text(cell, strings, ns):
    t = cell.get('t')
    if t == 's':
        v = cell.find(f'{ns}v')
        try:
            return strings[int(v.text)] if v is not None and v.text is not None else ''
        except (ValueError, IndexError, TypeError):
            return ''
    if t == 'inlineStr':
        return ''.join(x.text or '' for x in cell.iter(f'{ns}t'))
    v = cell.find(f'{ns}v')
    return (v.text or '') if v is not None else ''


def main():
    if len(sys.argv) != 2:
        print('Uso: python3 convert_xlsx.py <ruta_al_xlsx>', file=sys.stderr)
        sys.exit(1)
    try:
        zf = zipfile.ZipFile(sys.argv[1])
    except (OSError, zipfile.BadZipFile) as err:
        print(f'No se pudo abrir el xlsx: {err}', file=sys.stderr)
        sys.exit(1)

    strings = shared_strings(zf)
    sheets = sheet_files(zf)
    for name, target in sheets:
        try:
            root = ET.fromstring(zf.read(target))
        except (KeyError, Exception):
            continue
        ns = get_namespace(root)
        print(f'## {name}\n')
        for row in root.iter(f'{ns}row'):
            cells = {}
            for c in row.findall(f'{ns}c'):
                text = cell_text(c, strings, ns).replace('\n', ' ').strip()
                r_val = get_local_attr(c, 'r') or ''
                cells[col_index(r_val)] = text
            if not cells or not any(cells.values()):
                continue
            width = max(cells.keys()) + 1
            print(' | '.join(cells.get(i, '') for i in range(width)).rstrip())
        print()


if __name__ == '__main__':
    main()

