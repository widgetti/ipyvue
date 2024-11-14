from traitlets import Unicode, Instance, Union, List, Any, Dict
from ipywidgets import DOMWidget
from ipywidgets.widgets.widget_layout import Layout
from ipywidgets.widgets.widget import widget_serialization, CallbackDispatcher
from ipywidgets.widgets.trait_types import InstanceDict

from ._version import semver
from .ForceLoad import force_load_instance


class ClassList:
    def __init__(self, obj):
        self.obj = obj

    def remove(self, *classes):
        """
        Remove class elements from the class_ trait of the linked object.

        :param *classes (str): The classes to remove
        """

        classes = [str(c) for c in classes]

        src_classes = self.obj.class_.split() if self.obj.class_ else []
        dst_classes = [c for c in src_classes if c not in classes]

        self.obj.class_ = " ".join(dst_classes)

    def add(self, *classes):
        """
        add class elements to the class_ trait of the linked object.

        :param *classes (str): The classes to add
        """

        classes = [str(c) for c in classes]

        src_classes = self.obj.class_.split() if self.obj.class_ else []
        dst_classes = src_classes + [c for c in classes if c not in src_classes]

        self.obj.class_ = " ".join(dst_classes)

    def toggle(self, *classes):
        """
        toggle class elements to the class_ trait of the linked object.

        :param *classes (str): The classes to toggle
        """

        classes = [str(c) for c in classes]

        src_classes = self.obj.class_.split() if self.obj.class_ else []
        dst_classes = [c for c in src_classes if c not in classes] + [
            c for c in classes if c not in src_classes
        ]

        self.obj.class_ = " ".join(dst_classes)

    def replace(self, src, dst):
        """
        Replace class element by another in the class_ trait of the linked object.

        :param (source, destination). If the source is not found nothing is done.
        """
        src_classes = self.obj.class_.split() if self.obj.class_ else []

        src = str(src)
        dst = str(dst)

        dst_classes = [dst if c == src else c for c in src_classes]

        self.obj.class_ = " ".join(dst_classes)


class Events(object):
    def __init__(self, **kwargs):
        self._event_handlers_map = {}
        self.on_msg(self._handle_event)

    def on_event(self, event_and_modifiers, callback, remove=False):
        new_event = event_and_modifiers.split(".")[0]
        for existing_event in [
            event
            for event in self._event_handlers_map.keys()
            if event == new_event or event.startswith(new_event + ".")
        ]:
            del self._event_handlers_map[existing_event]

        self._event_handlers_map[event_and_modifiers] = CallbackDispatcher()

        self._event_handlers_map[event_and_modifiers].register_callback(
            callback, remove=remove
        )

        if remove and not self._event_handlers_map[event_and_modifiers].callbacks:
            del self._event_handlers_map[event_and_modifiers]

        difference = set(self._event_handlers_map.keys()) ^ set(self._events)
        if len(difference) != 0:
            self._events = list(self._event_handlers_map.keys())

    def fire_event(self, event, data=None):
        """Manually trigger an event handler on the Python side."""
        # note that a click event will trigger click.stop if that particular
        # event+modifier is registered.
        event_match = [
            k for k in self._event_handlers_map.keys() if k.startswith(event)
        ]
        if not event_match:
            raise ValueError(f"'{event}' not found in widget {self}")

        self._fire_event(event_match[0], data)

    def click(self, data=None):
        """Manually triggers the event handler for the 'click' event

        Note that this does not trigger a click event in the browser, this only
        invokes the Python event handlers.
        """
        self.fire_event("click", data or {})

    def _fire_event(self, event, data=None):
        dispatcher = self._event_handlers_map[event]
        # we don't call via the dispatcher, since that eats exceptions
        for callback in dispatcher.callbacks:
            callback(self, event, data)

    def _handle_event(self, _, content, buffers):
        event = content.get("event", "")
        data = content.get("data", {})
        self._fire_event(event, data)


class VueWidget(DOMWidget, Events):
    # we can drop this when https://github.com/jupyter-widgets/ipywidgets/pull/3592
    # is merged
    layout = InstanceDict(Layout, allow_none=True).tag(
        sync=True, **widget_serialization
    )

    # Force the loading of jupyter-vue before dependent extensions when in a static
    # context (embed, voila)
    _jupyter_vue = Any(force_load_instance, read_only=True).tag(
        sync=True, **widget_serialization
    )

    _model_name = Unicode("VueModel").tag(sync=True)

    _view_name = Unicode("VueView").tag(sync=True)

    _view_module = Unicode("jupyter-vue").tag(sync=True)

    _model_module = Unicode("jupyter-vue").tag(sync=True)

    _view_module_version = Unicode(semver).tag(sync=True)

    _model_module_version = Unicode(semver).tag(sync=True)

    children = List(Union([Instance(DOMWidget), Unicode()])).tag(
        sync=True, **widget_serialization
    )

    slot = Unicode(None, allow_none=True).tag(sync=True)

    _events = List(Unicode()).tag(sync=True)

    v_model = Any("!!disabled!!", allow_none=True).tag(sync=True)

    style_ = Unicode(None, allow_none=True).tag(sync=True)

    class_ = Unicode(None, allow_none=True).tag(sync=True)

    attributes = Dict(None, allow_none=True).tag(sync=True)

    v_slots = List(Dict()).tag(sync=True, **widget_serialization)

    v_on = Unicode(None, allow_none=True).tag(sync=True)

    def __init__(self, **kwargs):

        self.class_list = ClassList(self)

        super().__init__(**kwargs)

    def show(self):
        """Make the widget visible"""

        self.class_list.remove("d-none")

    def hide(self):
        """Make the widget invisible"""

        self.class_list.add("d-none")


__all__ = ["VueWidget"]
