"""ES module (ESM) support: ship precompiled bundles instead of .vue source.

Mirrors ipyreact's module mechanism: ``define_module(name, code_or_path)``
creates a ``Module`` widget whose code is sent to the frontend once, imported
via es-module-shims, and registered in the import map under ``name``. Vue
components exported by such a module can then be used as the implementation
of a VueTemplate (see ``Template.esm_module`` / ``Template.esm_export``),
bypassing the in-browser SFC compiler entirely.
"""

from pathlib import Path
from typing import List, Optional

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


def define_module(
    name: str,
    module: Optional[Path] = None,
    *,
    code: Optional[str] = None,
    url: Optional[str] = None,
) -> Module:
    """Register an ES module under a name.

    Parameters
    ----------
    name:
        Import-map name the module will be available under.
    module:
        Path to the module source on disk (e.g. a vite/rollup build with
        ``vue`` marked external).
    code:
        The module source as a string.
    url:
        A url the module is served from (e.g. a bundle in the app's
        static dir).
    """
    if sum(x is not None for x in (module, code, url)) != 1:
        raise TypeError("pass exactly one of module (a Path), code or url")
    if module is not None and not isinstance(module, Path):
        raise TypeError("module must be a Path; use url=... or code=... for strings")
    dependencies = [n for n in _module_names if n != name]
    if name not in _module_names:
        _module_names.append(name)
    if url is not None:
        return Module(url=url, name=name, dependencies=dependencies)
    if code is None:
        assert module is not None
        code = module.read_text(encoding="utf8")
    return Module(code=code, name=name, dependencies=dependencies)


def get_module_names() -> List[str]:
    return list(_module_names)


__all__ = ["Module", "define_module", "get_module_names"]
