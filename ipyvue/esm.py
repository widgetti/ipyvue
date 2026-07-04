"""ES module (ESM) support: ship precompiled bundles instead of .vue source.

Mirrors ipyreact's module mechanism: ``define_module(name, code_or_path)``
creates a ``Module`` widget whose code is sent to the frontend once, imported
via es-module-shims, and registered in the import map under ``name``. Vue
components exported by such a module can then be used as the implementation
of a VueTemplate (see ``Template.esm_module`` / ``Template.esm_export``),
bypassing the in-browser SFC compiler entirely.
"""

from pathlib import Path
from typing import List, Union

from ipywidgets import Widget
from traitlets import List as ListTrait
from traitlets import Unicode

from ._version import semver

_module_names: List[str] = []


class Module(Widget):
    _model_name = Unicode("ModuleModel").tag(sync=True)
    _model_module = Unicode("jupyter-vue").tag(sync=True)
    _model_module_version = Unicode(semver).tag(sync=True)

    name = Unicode().tag(sync=True)
    code = Unicode().tag(sync=True)
    # when set, the module is imported from this url instead of shipping the
    # code over the widget model (e.g. a bundle served from a static dir)
    url = Unicode(None, allow_none=True).tag(sync=True)
    dependencies = ListTrait(Unicode(), default_value=[]).tag(sync=True)


def define_module(name: str, module: Union[str, Path]) -> Module:
    """Register an ES module under a name.

    Parameters
    ----------
    name:
        Import-map name the module will be available under.
    module:
        The ES module source, or a Path to it (e.g. a vite/rollup build with
        ``vue`` marked external).
    """
    dependencies = [n for n in _module_names if n != name]
    if name not in _module_names:
        _module_names.append(name)
    if isinstance(module, str) and (
        module.startswith("http") or module.startswith("/")
    ):
        return Module(url=module, name=name, dependencies=dependencies)
    code = module.read_text(encoding="utf8") if isinstance(module, Path) else module
    return Module(code=code, name=name, dependencies=dependencies)


def get_module_names() -> List[str]:
    return list(_module_names)


__all__ = ["Module", "define_module", "get_module_names"]
