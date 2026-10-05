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


def test_default_dependencies_skip_closed_modules():
    first = esm.define_module("closed-module", code="export const value = 1;")
    first.close()

    second = esm.define_module("next-module", code="export const value = 2;")

    assert second.dependencies == []


def test_explicit_dependencies_are_used():
    esm.define_module("first-module", code="export const value = 1;")

    second = esm.define_module(
        "second-module",
        code="export const value = 2;",
        dependencies=["manual-module"],
    )

    assert second.dependencies == ["manual-module"]


def test_failed_path_read_does_not_register_name(tmp_path):
    missing = tmp_path / "missing.mjs"

    with pytest.raises(FileNotFoundError):
        esm.define_module("missing-module", missing)

    assert "missing-module" not in esm._module_names


def test_plain_string_module_argument_raises():
    with pytest.raises(TypeError, match="url=|code="):
        esm.define_module("string-module", "https://example.test/module.mjs")
