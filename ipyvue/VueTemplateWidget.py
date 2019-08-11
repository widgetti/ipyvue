from traitlets import Any, Unicode, List, Dict
from ipywidgets import DOMWidget
from ipywidgets.widgets.widget import widget_serialization
from ._version import semver
from .ForceLoad import force_load_instance


class Events(object):
    def __init__(self, **kwargs):
        self.on_msg(self._handle_event)
        self.events = [item[4:] for item in dir(self) if item.startswith("vue_")]

    def _handle_event(self, _, content, buffers):
        event = content.get("event", "")
        data = content.get("data", {})
        getattr(self, 'vue_' + event)(data)


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

    events = List(Unicode(), default_value=None, allow_none=True).tag(sync=True)

    components = Dict(default_value=None, allow_none=True).tag(sync=True, **widget_serialization)


__all__ = ['VueTemplate']
