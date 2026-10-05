from pathlib import Path

import pytest

import ipyvue.esm as esm


@pytest.fixture(autouse=True)
def clean_module_registry():
    names = list(esm._module_names)
    widgets = dict(getattr(esm, "_module_widgets", {}))
    esm._module_names.clear()
    if hasattr(esm, "_module_widgets"):
        esm._module_widgets.clear()
    yield
    esm._module_names[:] = names
    if hasattr(esm, "_module_widgets"):
        esm._module_widgets.clear()
        esm._module_widgets.update(widgets)


def test_define_module_default_dependencies_skip_closed_modules():
    first = esm.define_module("first", code="export default {};")
    first.close()

    second = esm.define_module("second", code="export default {};")

    assert second.dependencies == []


def test_define_module_explicit_dependencies_win():
    esm.define_module("first", code="export default {};")

    second = esm.define_module(
        "second",
        code="export default {};",
        dependencies=["explicit"],
    )

    assert second.dependencies == ["explicit"]


def test_define_module_failed_read_registers_nothing(tmp_path: Path):
    missing = tmp_path / "missing.mjs"

    with pytest.raises(FileNotFoundError):
        esm.define_module("missing", missing)

    assert "missing" not in esm.get_module_names()


def test_define_module_plain_str_module_raises_type_error():
    with pytest.raises(TypeError, match="use url=.* or code=.* for strings"):
        esm.define_module("plain-str", "https://example.invalid/module.mjs")


def test_define_module_redefine_updates_live_widget_without_cycle():
    a = esm.define_module("a", code="export default 1;")
    b = esm.define_module("b", code="export default 2;")

    # re-running the cell must not create a2->[b], b2->[a]
    a2 = esm.define_module("a", code="export default 3;")
    b2 = esm.define_module("b", url="https://example.invalid/b.mjs")

    assert a2 is a and b2 is b
    assert a.dependencies == [] and a.code == "export default 3;"
    assert b.dependencies == ["a"] and b.url and b.code == ""
