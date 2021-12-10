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
