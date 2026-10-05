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
