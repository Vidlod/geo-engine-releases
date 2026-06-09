"""Tests del linter. Ejecutar con: python -m pytest  (o)  python tests/test_rules.py"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from geo_engine import Linter, load_config  # noqa: E402


def _linter():
    return Linter(load_config())


def test_max_br():
    # Saltos DENTRO de un bloque (no entre bloques) para aislar max-br.
    # Máximo permitido = 1 (nunca <br><br>).
    html = "<p>uno<br><br><br><br>dos</p>"
    fixed = _linter().fix(html)
    assert "<br><br>" not in fixed.html
    assert "<br>" in fixed.html
    assert fixed.changed


def test_br_before_close():
    html = "<li>texto.<br><br></li>"
    fixed = _linter().fix(html)
    assert fixed.html == "<li>texto.</li>"


def test_br_between_blocks():
    html = "<p>intro.</p><br><br><ul><li>a.</li></ul><br><p>fin.</p>"
    fixed = _linter().fix(html)
    assert "</p><ul>" in fixed.html       # br eliminado entre p y ul
    # lista→párrafo: el <br> SÍ se conserva (el <p> no tiene margen superior)
    assert "</ul><br><p>" in fixed.html


def test_br_list_to_p_preserved():
    # </ul><br><p> se conserva; </p><br><p> y </p><br><ul> se eliminan.
    html = "<ul><li>a.</li></ul><br><p>x.</p><br><p>y.</p><br><ul><li>b.</li></ul>"
    fixed = _linter().fix(html)
    assert "</ul><br><p>x." in fixed.html   # lista→párrafo: conservado
    assert "</p><p>y." in fixed.html        # párrafo→párrafo: eliminado
    assert "</p><ul>" in fixed.html         # párrafo→lista: eliminado


def test_br_before_button():
    # El <br><br> antes del <div> centrado del botón SÍ se elimina (Regla 28).
    html = "<p>texto.</p><br><br><div style=\"text-align: center;\"><a>x</a></div>"
    fixed = _linter().fix(html)
    assert "<br>" not in fixed.html
    assert "</p><div" in fixed.html


def test_terminology_module():
    html = "<p>Este módulo y el Módulo dos y los módulos.</p>"
    fixed = _linter().fix(html)
    assert "módulo" not in fixed.html.lower()
    assert "curso" in fixed.html
    assert "Curso dos" in fixed.html
    assert "cursos" in fixed.html


def test_emoticon_span():
    html = "<p>Correcto (y) e incorrecto (x).</p>"
    fixed = _linter().fix(html)
    assert "(<span>y</span>)" in fixed.html
    assert "(<span>x</span>)" in fixed.html


def test_link_target_added():
    html = '<a href="https://x.com">link</a>'
    fixed = _linter().fix(html)
    assert 'target="_blank"' in fixed.html
    assert "rel=" in fixed.html


def test_link_anchor_skipped():
    html = '<a href="#seccion">ir</a>'
    fixed = _linter().fix(html)
    assert 'target="_blank"' not in fixed.html


def test_elibro_proxy():
    html = "https://elibronet.ezproxy.udes.edu.co/es/ereader/1"
    fixed = _linter().fix(html)
    assert "elibro-net.ezproxy.udes.edu.co" in fixed.html


def test_tablero_anotaciones():
    html = "<p>Envíe el documento a través del tablero de anotaciones hoy.</p>"
    fixed = _linter().fix(html)
    assert "tablero de anotaciones" not in fixed.html
    assert "Envíe el documento hoy." in fixed.html


def test_no_italics_em():
    html = "<p>Autor (2020). <em>Título</em>.</p>"
    fixed = _linter().fix(html)
    assert "<em>" not in fixed.html
    assert "Título" in fixed.html


def test_li_period_detected():
    html = "<ul><li>sin punto final</li></ul>"
    result = _linter().check(html)
    assert any(f.rule_id == "li-period" for f in result.findings)


def test_li_paragraph_detected():
    html = "<ul><li><p>texto.</p></li></ul>"
    result = _linter().check(html)
    assert any(f.rule_id == "li-paragraph" for f in result.findings)


def test_producto_final():
    from geo_engine import Linter
    cfg = load_config()
    cfg["rules"]["producto-final"]["last_avance"] = 5
    linter = Linter(cfg)
    html = '<h3>Avance 5</h3> Avance 4 <a title="Avance 5">x</a> Avance 52'
    fixed = linter.fix(html)
    assert "<h3>Producto Final</h3>" in fixed.html
    assert 'title="Producto Final"' in fixed.html
    assert "Avance 4" in fixed.html       # otro avance: intacto
    assert "Avance 52" in fixed.html      # no es palabra completa: intacto


def test_producto_final_noop_sin_config():
    # Sin last_avance (None), la regla no debe tocar nada.
    from geo_engine import Linter
    cfg = load_config()
    cfg["rules"]["producto-final"]["last_avance"] = None
    linter = Linter(cfg)
    html = "<h3>Avance 5</h3>"
    fixed = linter.fix(html)
    assert "Avance 5" in fixed.html


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        try:
            fn()
            print("PASS %s" % fn.__name__)
            passed += 1
        except AssertionError as exc:
            print("FAIL %s -> %s" % (fn.__name__, exc))
    print("\n%d/%d tests OK" % (passed, len(fns)))
    return 0 if passed == len(fns) else 1


if __name__ == "__main__":
    sys.exit(_run_all())
