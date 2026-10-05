"""ES module (ESM) support: ship precompiled bundles instead of .vue source.

Mirrors ipyreact's module mechanism: ``define_module(name, path_or_source)``
creates a ``Module`` widget whose source is sent to the frontend once,
imported via es-module-shims, and registered in the import map under ``name``.
Vue components exported by such a module can then be used as the
implementation of a VueTemplate (see ``Template.esm_module`` /
``Template.esm_export``), bypassing the in-browser SFC compiler entirely.
"""

from pathlib import Path
from typing import Dict, List, Optional

from ipywidgets import Widget
from traitlets import List as ListTrait
from traitlets import Unicode

from ._version import semver

_module_names: List[str] = []
_module_widgets: Dict[str, "Module"] = {}
# like solara, a name keeps the dependencies it was first defined with, so a
# redefinition cannot pick up later modules and form a cycle (a->[b], b->[a])
_module_dependencies: Dict[str, List[str]] = {}


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
        A Path to the module source on disk (e.g. a vite/rollup build with
        ``vue`` marked external).
    code:
        The module source as a string (alternative to ``module``).
    url:
        A URL the module is served from (alternative to ``module`` or
        ``code``).
    dependencies:
        Module names to wait for before loading. Defaults to the
        dependencies of the first definition of this name, else to the live
        modules defined earlier in this process.
    """
    if isinstance(module, str):
        raise TypeError("module must be a Path; use url= or code= for strings")
    if sum(source is not None for source in (module, code, url)) != 1:
        raise TypeError("pass exactly one of module, code, or url")
    if module is not None:
        code = module.read_text(encoding="utf8")
    if dependencies is None:
        dependencies = _module_dependencies.get(name)
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
    if dependencies is None:
        dependencies = [
            n
            for n in _module_names
            if n != name
            and (widget := _module_widgets.get(n)) is not None
            and widget.comm is not None
        ]
    widget = Module(
        code=code or "",
        url=url,
        name=name,
        dependencies=dependencies,
    )
    if name not in _module_names:
        _module_names.append(name)
    _module_dependencies.setdefault(name, dependencies)
    _module_widgets[name] = widget
    return widget


def get_module_names() -> List[str]:
    return list(_module_names)


__all__ = ["Module", "define_module", "get_module_names"]
