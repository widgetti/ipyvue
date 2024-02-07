from ipywidgets import Widget
import threading


lock = threading.Lock()


def singleton(WidgetClass, **kwargs):
    # find a 'shared' instance (singleton) to avoid creating
    # too many widgets. In contexts where self.widgets is not
    # a global dict, this allows different users/context to
    # have a singleton without sharing the widget
    with lock:
        if hasattr(Widget, "widgets"):
            # pre 8.0
            all_widgets = Widget.widgets
        if hasattr(Widget, "widgets"):
            all_widgets = Widget._widgets
        else:

        for widget in all_widgets.values():
            if isinstance(widget, WidgetClass):
                return widget
        return WidgetClass(**kwargs)
