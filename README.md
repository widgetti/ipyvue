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
    $ pip install -e .
    $ jupyter nbextension install --py --symlink --sys-prefix ipyvue
    $ jupyter nbextension enable --py --sys-prefix ipyvue
