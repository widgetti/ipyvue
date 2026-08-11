import os
from traitlets import Unicode
from ipywidgets import DOMWidget
from ._version import semver


class VueComponent(DOMWidget):
    _model_name = Unicode("VueComponentModel").tag(sync=True)
    _model_module = Unicode("jupyter-vue").tag(sync=True)
    _model_module_version = Unicode(semver).tag(sync=True)

    name = Unicode().tag(sync=True)
    component = Unicode().tag(sync=True)
    source_url = Unicode(None, allow_none=True).tag(sync=True)


vue_component_registry = {}
vue_component_files = {}


def register_component_from_string(name, value, source_url=None):
    components = vue_component_registry

    if name in components.keys():
        comp = components[name]
        comp.component = value
        comp.source_url = source_url
    else:
        comp = VueComponent(name=name, component=value, source_url=source_url)
        components[name] = comp


def register_component_from_file(name, file_name, relative_to_file=None):
    # for backward compatibility with previous argument arrangement
    if name is None:
        name = file_name
        file_name = relative_to_file
        relative_to_file = None

    if relative_to_file:
        file_name = os.path.join(os.path.dirname(relative_to_file), file_name)
    abs_path = os.path.abspath(file_name)
    with open(file_name) as f:
        vue_component_files[abs_path] = name
        register_component_from_string(
            name, f.read(), source_url=os.path.basename(abs_path)
        )


__all__ = [
    "VueComponent",
    "register_component_from_string",
    "register_component_from_file",
]
