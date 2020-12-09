import os
from traitlets import Any, Unicode, List, Dict, Union, Instance
from ipywidgets import DOMWidget
from ipywidgets.widgets.widget import widget_serialization

from .Template import Template, get_template
from ._version import semver
from .ForceLoad import force_load_instance
import inspect
from importlib import import_module

OBJECT_REF = 'objectRef'
FUNCTION_REF = 'functionRef'


class Events(object):
    def __init__(self, **kwargs):
        self.on_msg(self._handle_event)
        self.events = [item[4:] for item in dir(self) if item.startswith("vue_")]

    def _handle_event(self, _, content, buffers):
        def resolve_ref(value):
            if isinstance(value, dict):
                if OBJECT_REF in value.keys():
                    obj = getattr(self, value[OBJECT_REF])
                    for path_item in value.get('path', []):
                        obj = obj[path_item]
                    return obj
                if FUNCTION_REF in value.keys():
                    fn = getattr(self, value[FUNCTION_REF])
                    args = value.get('args', [])
                    kwargs = value.get('kwargs', {})
                    return fn(*args, **kwargs)
            return value

        if 'create_widget' in content.keys():
            module_name = content['create_widget'][0]
            class_name = content['create_widget'][1]
            props = {k: resolve_ref(v) for k, v in content['props'].items()}
            module = import_module(module_name)
            widget = getattr(module, class_name)(**props, model_id=content['id'])
            self._component_instances = [*self._component_instances, widget]
        elif 'update_ref' in content.keys():
            widget = DOMWidget.widgets[content['id']]
            prop = content['prop']
            obj = resolve_ref(content['update_ref'])
            setattr(widget, prop, obj)
        elif 'destroy_widget' in content.keys():
            self._component_instances = [w for w in self._component_instances
                                         if w.model_id != content['destroy_widget']]
        elif 'event' in content.keys():
            event = content.get("event", "")
            data = content.get("data", {})
            if buffers:
                getattr(self, 'vue_' + event)(data, buffers)
            else:
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


def as_refs(name, data):
    def to_ref_structure(obj, path):
        if isinstance(obj, list):
            return [to_ref_structure(item, [*path, index]) for index, item in enumerate(obj)]
        if isinstance(obj, dict):
            return {k: to_ref_structure(v, [*path, k]) for k, v in obj.items()}

        # add object id to detect a new object in the same structure
        return {OBJECT_REF: name, 'path': path, 'id': id(obj)}

    return to_ref_structure(data, [])


class VueTemplate(DOMWidget, Events):

    class_component_serialization = {
        'from_json': widget_serialization['to_json'],
        'to_json': _class_to_json
    }

    # Force the loading of jupyter-vue before dependent extensions when in a static context (embed,
    # voila)
    _jupyter_vue = Any(force_load_instance, read_only=True).tag(sync=True, **widget_serialization)

    _model_name = Unicode('VueTemplateModel').tag(sync=True)

    _view_name = Unicode('VueView').tag(sync=True)

    _view_module = Unicode('jupyter-vue').tag(sync=True)

    _model_module = Unicode('jupyter-vue').tag(sync=True)

    _view_module_version = Unicode(semver).tag(sync=True)

    _model_module_version = Unicode(semver).tag(sync=True)

    template = Union([
        Instance(Template),
        Unicode()]).tag(sync=True, **widget_serialization)

    css = Unicode(None, allow_none=True).tag(sync=True)

    methods = Unicode(None, allow_none=True).tag(sync=True)

    data = Unicode(None, allow_none=True).tag(sync=True)

    events = List(Unicode(), allow_none=True).tag(sync=True)

    components = Dict(default_value=None, allow_none=True).tag(
        sync=True, **class_component_serialization)

    _component_instances = List().tag(sync=True, **widget_serialization)

    template_file = None

    def __init__(self, *args, **kwargs):
        if self.template_file:
            abs_path = ''
            if type(self.template_file) == str:
                abs_path = os.path.abspath(self.template_file)
            elif type(self.template_file) == tuple:
                rel_file, path = self.template_file
                abs_path = os.path.join(os.path.dirname(rel_file), path)

            self.template = get_template(abs_path)

        super().__init__(*args, **kwargs)

        sync_ref_traitlets = [v for k, v in self.traits().items()
                              if 'sync_ref' in v.metadata.keys()]

        def create_ref_and_observe(traitlet):
            data = traitlet.get(self)
            ref_name = traitlet.name + '_ref'
            self.add_traits(**{ref_name: Any(as_refs(traitlet.name, data)).tag(sync=True)})

            def on_ref_source_change(change):
                setattr(self, ref_name, as_refs(traitlet.name, change['new']))

            self.observe(on_ref_source_change, traitlet.name)

        for traitlet in sync_ref_traitlets:
            create_ref_and_observe(traitlet)


__all__ = ['VueTemplate']
