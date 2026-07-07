[![Version](https://img.shields.io/npm/v/jupyter-vue.svg)](https://www.npmjs.com/package/jupyter-vue)
[![Version](https://img.shields.io/pypi/v/ipyvue.svg)](https://pypi.python.org/project/ipyvue)
[![Conda Version](https://img.shields.io/conda/vn/conda-forge/ipyvue.svg)](https://anaconda.org/conda-forge/ipyvue)
[![black badge](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

ipyvue
======

Jupyter widgets base for [Vue](https://vuejs.org/) libraries

Installation
------------

To install use pip:

    $ pip install ipyvue
    $ jupyter nbextension enable --py --sys-prefix ipyvue


For a development installation (requires npm),

    $ git clone https://github.com/mariobuikhuizen/ipyvue.git
    $ cd ipyvue
    $ pip install -e ".[dev]"
    $ jupyter nbextension install --py --symlink --sys-prefix ipyvue
    $ jupyter nbextension enable --py --sys-prefix ipyvue
    $ jupyter labextension develop . --overwrite

Scoped CSS Support
------------------

`<style scoped>` in `VueTemplate` templates is supported but disabled by default for backwards
compatibility. When enabled, CSS rules only apply to the component's own elements.

Enable globally via environment variable:

    $ IPYVUE_SCOPED_CSS_SUPPORT=1 jupyter lab

Or in Python:

```python
import ipyvue
ipyvue.scoped_css_support = True
```

Or per widget:

```python
from ipyvue import VueTemplate

class MyComponent(VueTemplate):
    template = """
    <template>
        <span class="styled">Hello</span>
    </template>
    <style scoped>
        .styled { color: red; }
    </style>
    """

widget = MyComponent(scoped_css_support=True)
```

Note: The `css` trait with `scoped=True` always works, regardless of this setting:

```python
widget = VueTemplate(
    template="<template><span class='x'>Hi</span></template>",
    css=".x { color: blue; }",
    scoped=True
)
```

Explicit sync with $emit
------------------------

Every trait of a `VueTemplate` is two-way bound: the template can assign to it
directly and the change is synced back to Python. In addition, the template
can sync a trait explicitly with `$emit("update:<name>", value)` (the same
contract as vue's `.sync` modifier / `v-model`), and send any event listed in
`events` with `$emit("<name>", value)` instead of calling it as a method:

```python
import traitlets
from ipyvue import VueTemplate

class Counter(VueTemplate):
    template = traitlets.Unicode('''
        <template>
            <button @click="$emit('update:count', count + 1)">
                clicked {{ count }} times
            </button>
        </template>
    ''').tag(sync=True)
    count = traitlets.Int(0).tag(sync=True)
```

This style makes the data flow explicit (read the value, emit the change),
matches how pure Vue components are written, and ports cleanly to vue3's
`defineModel()` semantics.

To go fully vue-like, props declared in the template's `<script>` block can be
honored (they are ignored by default, since existing templates rely on that):
matching traits are then passed as one-way vue props — assignment no longer
syncs back (vue warns instead), only `$emit("update:<name>", value)` does.
Enable with `IPYVUE_TEMPLATE_PROPS_SUPPORT=1`, `ipyvue.template_props_support
= True`, or per widget:

```python
class Counter(VueTemplate):
    template = traitlets.Unicode('''
        <template>
            <button @click="$emit('update:count', count + 1)">
                clicked {{ count }} times
            </button>
        </template>
        <script>
        export default {
            props: ["count"],
        };
        </script>
    ''').tag(sync=True)
    count = traitlets.Int(0).tag(sync=True)

widget = Counter(template_props_support=True)
```

Sponsors
--------

Project ipyvue receives direct funding from the following sources:

[![MSD](resources/msd-logo.svg)](https://msd.com)
