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


vue_component_registry = {}
vue_component_files = {}


def register_component_from_string(name, value):
    components = vue_component_registry

    if name in components.keys():
        comp = components[name]
        comp.component = value
    else:
        comp = VueComponent(name=name, component=value)
        components[name] = comp


def register_component_from_file(name, file_name, relative_to_file=None):
    # for backward compatibility with previous argument arrangement
    if name is None:
        name = file_name
        file_name = relative_to_file
        relative_to_file = None

    if relative_to_file:
        file_name = os.path.join(os.path.dirname(relative_to_file), file_name)
    with open(file_name) as f:
        vue_component_files[os.path.abspath(file_name)] = name
        register_component_from_string(name, f.read())


__all__ = [
    "VueComponent",
    "register_component_from_string",
    "register_component_from_file",
]
