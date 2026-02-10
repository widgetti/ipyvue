import os

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


def _parse_bool_env(key: str, default: bool = False) -> bool:
    """Parse boolean from environment variable."""
    val = os.environ.get(key, "").lower()
    if val in ("1", "true", "yes", "on"):
        return True
    if val in ("0", "false", "no", "off"):
        return False
    return default


# Global default for scoped CSS support in VueTemplate.
# Can be set via environment variable IPYVUE_SCOPED_CSS_SUPPORT=1
# or changed at runtime: ipyvue.scoped_css_support = True
scoped_css_support = _parse_bool_env("IPYVUE_SCOPED_CSS_SUPPORT", False)


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
