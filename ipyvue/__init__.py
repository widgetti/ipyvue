from ._version import version_info, __version__  # noqa: F401
from .Html import Html  # noqa: F401
from .Template import Template, watch  # noqa: F401
from .VueWidget import VueWidget  # noqa: F401
from .VueTemplateWidget import VueTemplate  # noqa: F401
from .VueComponentRegistry import (VueComponent, register_component_from_string,  # noqa: F401
    register_component_from_file)  # noqa: F401


def _jupyter_labextension_paths():
    return [{
        'src': 'labextension',
        'dest': 'jupyter-vue',
    }]


def _jupyter_nbextension_paths():
    return [{
        'section': 'notebook',
        'src': 'nbextension',
        'dest': 'jupyter-vue',
        'require': 'jupyter-vue/extension'
    }]
