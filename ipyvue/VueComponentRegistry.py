from traitlets import Unicode
from ipywidgets import DOMWidget
from ._version import semver


class VueComponent(DOMWidget):
    _model_name = Unicode('VueComponentModel').tag(sync=True)
    _model_module = Unicode('jupyter-vue').tag(sync=True)
    _model_module_version = Unicode(semver).tag(sync=True)

    name = Unicode().tag(sync=True)
    component = Unicode().tag(sync=True)


vue_component_registry = {}


def register_component_from_string(name, value):
    components = vue_component_registry

    if name in components.keys():
        comp = components[name]
        comp.component = value
    else:
        comp = VueComponent(name=name, component=value)
        components[name] = comp


def register_component_from_file(self, name, file_name):
    with open(file_name) as f:
        register_component_from_string(name, f.read())


__all__ = ['VueComponent', 'register_component_from_string', 'register_component_from_file']
