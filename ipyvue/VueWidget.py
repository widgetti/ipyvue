from traitlets import (Unicode, Instance, Union, List, Any)
from ipywidgets import DOMWidget
from ipywidgets.widgets.widget import (widget_serialization, CallbackDispatcher)
from ._version import semver
from .ForceLoad import force_load_instance


class Events(object):
    def __init__(self, **kwargs):
        self._event_handlers_map = {}
        self.on_msg(self._handle_event)

    def on_event(self, event, callback, remove=False):
        self._event_handlers_map[event] = CallbackDispatcher()

        self._event_handlers_map[event].register_callback(callback, remove=remove)

        if remove and not self._event_handlers_map[event].callbacks:
            del self._event_handlers_map[event]

        difference = set(self._event_handlers_map.keys()) ^ set(self._events)
        if len(difference) != 0:
            self._events = list(self._event_handlers_map.keys())

    def fire_event(self, event, data):
        self._event_handlers_map[event](self, event, data)

    def _handle_event(self, _, content, buffers):
        event = content.get("event", "")
        data = content.get("data", {})
        self.fire_event(event, data)


class VueWidget(DOMWidget, Events):

    # Force the loading of jupyter-vue before dependent extensions when in a static context (embed,
    # voila)
    _jupyter_vue = Any(force_load_instance, read_only=True).tag(sync=True, **widget_serialization)

    _model_name = Unicode('VueModel').tag(sync=True)

    _view_name = Unicode('VueView').tag(sync=True)

    _view_module = Unicode('jupyter-vue').tag(sync=True)

    _model_module = Unicode('jupyter-vue').tag(sync=True)

    _view_module_version = Unicode(semver).tag(sync=True)

    _model_module_version = Unicode(semver).tag(sync=True)

    children = List(Union([
        Instance(DOMWidget),
        Unicode()
    ], default_value=None)).tag(sync=True, **widget_serialization)

    slot = Unicode(None, allow_none=True).tag(sync=True)

    _events = List(Unicode(), default_value=None, allow_none=True).tag(sync=True)

    v_model = Any('!!disabled!!', allow_none=True).tag(sync=True)

    style_ = Unicode(None, allow_none=True).tag(sync=True)

    class_ = Unicode(None, allow_none=True).tag(sync=True)


__all__ = ['VueWidget']
