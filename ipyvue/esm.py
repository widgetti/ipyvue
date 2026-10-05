"""ES module (ESM) support: ship precompiled bundles instead of .vue source.

Mirrors ipyreact's module mechanism: ``define_module(name, code_or_path)``
creates a ``Module`` widget whose code is sent to the frontend once, imported
via es-module-shims, and registered in the import map under ``name``. Vue
components exported by such a module can then be used as the implementation
of a VueTemplate (see ``Template.esm_module`` / ``Template.esm_export``),
bypassing the in-browser SFC compiler entirely.
"""

from pathlib import Path
from typing import Dict, List, Optional

from ipywidgets import Widget
from traitlets import List as ListTrait
from traitlets import Unicode

from ._version import semver

_module_names: List[str] = []
_module_widgets: Dict[str, "Module"] = {}


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
    dependencies: Optional[List[str]] = None,
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
    dependencies:
        Module names this module waits for before it loads. When omitted, this
        defaults to all earlier live modules.
    """
    if sum(x is not None for x in (module, code, url)) != 1:
        raise TypeError("pass exactly one of module (a Path), code or url")
    if module is not None and not isinstance(module, Path):
        raise TypeError("module must be a Path; use url=... or code=... for strings")
    if url is None and code is None:
        assert module is not None
        code = module.read_text(encoding="utf8")
    existing = _module_widgets.get(name)
    if existing is not None and existing.comm is not None:
        # redefining updates the live widget, like solara does: a second
        # widget would get the first as a dependency cycle (a->[b], b->[a])
        # and both would be restored on page reload
        with existing.hold_sync():
            existing.url = url
            existing.code = code or ""
            if dependencies is not None:
                existing.dependencies = dependencies
        return existing
    if dependencies is None and existing is not None:
        # a closed widget's name keeps its dependencies, like solara: the
        # default (all earlier live names) would now give a->[b], b->[a]
        dependencies = list(existing.dependencies)
    if url is not None:
        widget = Module(
            url=url, name=name, dependencies=_dependencies(name, dependencies)
        )
    else:
        widget = Module(
            code=code, name=name, dependencies=_dependencies(name, dependencies)
        )
    if name not in _module_names:
        _module_names.append(name)
    _module_widgets[name] = widget
    return widget


def _dependencies(name: str, dependencies: Optional[List[str]]) -> List[str]:
    if dependencies is not None:
        return dependencies
    return [
        module_name
        for module_name in _module_names
        if module_name != name
        and _module_widgets.get(module_name) is not None
        and _module_widgets[module_name].comm is not None
    ]


def get_module_names() -> List[str]:
    return list(_module_names)


__all__ = ["Module", "define_module", "get_module_names"]
