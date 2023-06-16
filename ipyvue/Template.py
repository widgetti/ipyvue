import os
from traitlets import Unicode
from ipywidgets import Widget

from .VueComponentRegistry import vue_component_files, register_component_from_file
from ._version import semver

template_registry = {}


def watch(paths=""):
    import logging
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler

    log = logging.getLogger("ipyvue")

    class VueEventHandler(FileSystemEventHandler):
        def on_modified(self, event):
            super(VueEventHandler, self).on_modified(event)
            if not event.is_directory:
                if event.src_path in template_registry:
                    log.info(f"updating: {event.src_path}")
                    with open(event.src_path) as f:
                        template_registry[event.src_path].template = f.read()
                elif event.src_path in vue_component_files:
                    log.info(f"updating component: {event.src_path}")
                    name = vue_component_files[event.src_path]
                    register_component_from_file(name, event.src_path)

    observer = Observer()

    if not isinstance(paths, (list, tuple)):
        paths = [paths]

    for path in paths:
        path = os.path.normpath(path)
        log.info(f"watching {path}")
        observer.schedule(VueEventHandler(), path, recursive=True)

    observer.start()


def get_template(abs_path):
    abs_path = os.path.normpath(abs_path)
    if abs_path not in template_registry:
        with open(abs_path, encoding="utf-8") as f:
            tw = Template(template=f.read())
            template_registry[abs_path] = tw
    else:
        with open(abs_path, encoding="utf-8") as f:
            template_registry[abs_path].template = f.read()
    return template_registry[abs_path]


class Template(Widget):
    _model_name = Unicode("TemplateModel").tag(sync=True)
    _model_module = Unicode("jupyter-vue").tag(sync=True)
    _model_module_version = Unicode(semver).tag(sync=True)

    template = Unicode(None, allow_none=True).tag(sync=True)


__all__ = ["Template", "watch"]
