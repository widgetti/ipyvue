from traitlets import Any, Unicode, List, Dict
from ipywidgets import DOMWidget
from ipywidgets.widgets.widget import widget_serialization
from ._version import semver
from .ForceLoad import force_load_instance
import inspect
from importlib import import_module

class Events(object):
    def __init__(self, **kwargs):
        self.on_msg(self._handle_event)
        self.events = [item[4:] for item in dir(self) if item.startswith("vue_")]

    def _handle_event(self, _, content, buffers):
        if 'create_widget' in content.keys():
            module_name = content['create_widget'][0]
            class_name = content['create_widget'][1]
            props = content['props']
            module = import_module(module_name)
            widget = getattr(module, class_name)(**props, model_id=content['id'])
            self._component_instances = [*self._component_instances, widget]
        elif 'destroy_widget' in content.keys():
            self._component_instances = [w for w in self._component_instances if w.model_id != content['destroy_widget']]
        else:
            event = content.get("event", "")
            data = content.get("data", {})
            getattr(self, 'vue_' + event)(data)


def _value_to_json(x, obj):
    if inspect.isclass(x):
        return {
            'class': [x.__module__, x.__name__],
            'props': x.class_trait_names()
        }
    return widget_serialization['to_json'](x, obj)


def _class_to_json(x, obj):
    if not x:
        return widget_serialization['to_json'](x, obj)
    return {k: _value_to_json(v, obj) for k, v in x.items()}


class_component_serialization = {
    'from_json': widget_serialization['to_json'],
    'to_json': _class_to_json
}

class VueTemplate(DOMWidget, Events):

    # Force the loading of jupyter-vue before dependent extensions when in a static context (embed,
    # voila)
    _jupyter_vue = Any(force_load_instance, read_only=True).tag(sync=True, **widget_serialization)

    _model_name = Unicode('VueTemplateModel').tag(sync=True)

    _view_name = Unicode('VueView').tag(sync=True)

    _view_module = Unicode('jupyter-vue').tag(sync=True)

    _model_module = Unicode('jupyter-vue').tag(sync=True)

    _view_module_version = Unicode(semver).tag(sync=True)

    _model_module_version = Unicode(semver).tag(sync=True)

    template = Unicode(None, allow_none=True).tag(sync=True)

    css = Unicode(None, allow_none=True).tag(sync=True)

    methods = Unicode(None, allow_none=True).tag(sync=True)

    data = Unicode(None, allow_none=True).tag(sync=True)

    events = List(Unicode(), default_value=None, allow_none=True).tag(sync=True)

    components = Dict(default_value=None, allow_none=True).tag(sync=True, **class_component_serialization)

    _component_instances = List().tag(sync=True, **widget_serialization)


__all__ = ['VueTemplate']
