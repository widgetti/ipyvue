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
                        template_registry[event.src_path].source_url = os.path.basename(
                            event.src_path
                        )
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
    with open(abs_path, encoding="utf-8") as f:
        template_text = f.read()

    template = template_registry.get(abs_path)

    if template is None:
        template = Template(
            template=template_text, source_url=os.path.basename(abs_path)
        )
        comm = template.comm
        # A template with DummyComm was never sent to the frontend, so a later
        # widget reference to its model id cannot be resolved by the widget manager.
        if (
            comm is not None
            and type(comm).__name__ != "DummyComm"
            and (not hasattr(comm, "kernel") or comm.kernel is not None)
        ):
            template_registry[abs_path] = template
    else:
        template.template = template_text
    return template


class Template(Widget):
    _model_name = Unicode("TemplateModel").tag(sync=True)
    _model_module = Unicode("jupyter-vue").tag(sync=True)
    _model_module_version = Unicode(semver).tag(sync=True)

    template = Unicode(None, allow_none=True).tag(sync=True)
    source_url = Unicode(None, allow_none=True).tag(sync=True)
    # When set, the component implementation comes from a precompiled ES
    # module (see ipyvue.esm.define_module) instead of compiling `template`
    # in the browser. `esm_export` selects the export (default: "default").
    esm_module = Unicode(None, allow_none=True).tag(sync=True)
    esm_export = Unicode(None, allow_none=True).tag(sync=True)


__all__ = ["Template", "watch"]
