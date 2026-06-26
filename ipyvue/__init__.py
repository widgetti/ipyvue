from ._version import __version__
from .Html import Html
from .Template import Template, watch
from .VueWidget import VueWidget
from .VueTemplateWidget import VueTemplate
from .VueComponentRegistry import (
    VueComponent,
    register_component_from_string,
    register_component_from_file,
)


def _jupyter_labextension_paths():
    return [
        {
            "src": "labextension",
            "dest": "jupyter-vue",
        }
    ]


def _jupyter_nbextension_paths():
    return [
        {
            "section": "notebook",
            "src": "nbextension",
            "dest": "jupyter-vue",
            "require": "jupyter-vue/extension",
        }
    ]
