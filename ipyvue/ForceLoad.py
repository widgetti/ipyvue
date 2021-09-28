from traitlets import Unicode
from ipywidgets import DOMWidget
from ._version import semver


class ForceLoad(DOMWidget):
    _model_name = Unicode("ForceLoadModel").tag(sync=True)
    _model_module = Unicode("jupyter-vue").tag(sync=True)
    _model_module_version = Unicode(semver).tag(sync=True)


force_load_instance = ForceLoad()
