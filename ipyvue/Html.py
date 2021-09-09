from traitlets import Unicode
from .VueWidget import VueWidget


class Html(VueWidget):

    _model_name = Unicode("HtmlModel").tag(sync=True)

    tag = Unicode().tag(sync=True)


__all__ = ["Html"]
