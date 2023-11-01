from __future__ import print_function

import glob
import re
import os
import platform
import sys
from distutils import log
from subprocess import CalledProcessError, check_call

from setuptools import Command, find_packages, setup
from setuptools.command.build_py import build_py
from setuptools.command.develop import develop
from setuptools.command.egg_info import egg_info
from setuptools.command.sdist import sdist

here = os.path.dirname(os.path.abspath(__file__))
node_root = os.path.join(here, "js")
is_repo = os.path.exists(os.path.join(here, ".git"))

npm_path = os.pathsep.join(
    [
        os.path.join(node_root, "node_modules", ".bin"),
        os.environ.get("PATH", os.defpath),
    ]
)

LONG_DESCRIPTION = "Jupyter widgets base for Vue libraries"


def convert_version_string(version_string):
    # Define a regex pattern to match version strings like "3.0.0.dev0"
    # "3.0.0.alpha1", etc.
    pattern = re.compile(r"(\d+\.\d+\.\d+)\.(dev|alpha|beta)(\d*)")

    # Search for the pattern in the input string
    match = pattern.search(version_string)
    if match:
        # Extract the matched groups
        main_version, pre_release, pre_release_number = match.groups()

        # If there is a pre-release number, add a '.' before it
        if pre_release_number:
            pre_release = f"{pre_release}.{pre_release_number}"

        # Reassemble the parts into the desired format
        new_version_string = f"{main_version}-{pre_release}"
        return new_version_string
    else:
        # If the pattern is not found, return the original string
        return version_string + "nomatch"


def get_data_files():
    js_version = convert_version_string(version_ns["__version__"])

    tgz = "jupyter-vue-" + js_version + ".tgz"
    return [
        ("share/jupyter/nbextensions/jupyter-vue", glob.glob("ipyvue/nbextension/*")),
        (
            "share/jupyter/labextensions/jupyter-vue",
            glob.glob("ipyvue/labextension/package.json"),
        ),
        (
            "share/jupyter/labextensions/jupyter-vue/static",
            glob.glob("ipyvue/labextension/static/*"),
        ),
        ("etc/jupyter/nbconfig/notebook.d", ["jupyter-vue.json"]),
        ("share/jupyter/lab/extensions", ["js/" + tgz]),
    ]


def js_prerelease(command, strict=False):
    """decorator for building minified js/css prior to another command"""

    class DecoratedCommand(command):
        def run(self):
            jsdeps = self.distribution.get_command_obj("jsdeps")
            if not is_repo and all(os.path.exists(t) for t in jsdeps.targets):
                # sdist, nothing to do
                command.run(self)
                return

            try:
                self.distribution.run_command("jsdeps")
            except Exception as e:
                missing = [t for t in jsdeps.targets if not os.path.exists(t)]
                if strict or missing:
                    log.warn("rebuilding js and css failed")
                    if missing:
                        log.error("missing files: %s" % missing)
                    raise e
                else:
                    log.warn("rebuilding js and css failed (not a problem)")
                    log.warn(str(e))
            command.run(self)
            update_package_data(self.distribution)

    return DecoratedCommand


def update_package_data(distribution):
    """update package_data to catch changes during setup"""
    build_py = distribution.get_command_obj("build_py")
    distribution.data_files = get_data_files()
    # re-init build_py options which load package_data
    build_py.finalize_options()


class NPM(Command):
    description = "install package.json dependencies using npm"

    user_options = []

    node_modules = os.path.join(node_root, "node_modules")

    targets = [
        os.path.join(here, "ipyvue", "nbextension", "extension.js"),
        os.path.join(here, "ipyvue", "nbextension", "index.js"),
    ]

    def initialize_options(self):
        pass

    def finalize_options(self):
        pass

    def get_npm_name(self):
        npmName = "npm"
        if platform.system() == "Windows":
            npmName = "npm.cmd"

        return npmName

    def has_npm(self):
        npmName = self.get_npm_name()
        try:
            check_call([npmName, "--version"])
            return True
        except CalledProcessError:
            return False

    def should_run_npm_install(self):
        return self.has_npm()

    def run(self):
        has_npm = self.has_npm()
        if not has_npm:
            log.error(
                "`npm` unavailable. If you're running this command using sudo, "
                "make sure `npm` is available to sudo"
            )

        env = os.environ.copy()
        env["PATH"] = npm_path

        if self.should_run_npm_install():
            log.info(
                "Installing build dependencies with npm.  This may take a while..."
            )
            npmName = self.get_npm_name()
            check_call(
                [npmName, "install"],
                cwd=node_root,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
            check_call(
                [npmName, "pack"], cwd=node_root, stdout=sys.stdout, stderr=sys.stderr
            )
            os.utime(self.node_modules, None)

        for t in self.targets:
            if not os.path.exists(t):
                msg = "Missing file: %s" % t
                if not has_npm:
                    msg += (
                        "\nnpm is required to build a development version of a"
                        " widget extension"
                    )
                raise ValueError(msg)

        # update package data in case this created new files
        update_package_data(self.distribution)


class DevelopCmd(develop):
    def run(self):
        check_call(["pre-commit", "install"])
        super(DevelopCmd, self).run()


version_ns = {}
with open(os.path.join(here, "ipyvue", "_version.py")) as f:
    exec(f.read(), {}, version_ns)

setup(
    name="ipyvue",
    version=version_ns["__version__"],
    description="Jupyter widgets base for Vue libraries",
    long_description=LONG_DESCRIPTION,
    include_package_data=True,
    data_files=get_data_files(),
    install_requires=[
        "ipywidgets>=7.0.0",
    ],
    extras_require={
        "test": [
            "solara[pytest]",
        ],
        "dev": [
            "pre-commit",
        ],
    },
    packages=find_packages(exclude=["tests", "tests.*"]),
    zip_safe=False,
    cmdclass={
        "build_py": js_prerelease(build_py),
        "egg_info": js_prerelease(egg_info),
        "sdist": js_prerelease(sdist, strict=True),
        "jsdeps": NPM,
        "develop": DevelopCmd,
    },
    author="Mario Buikhuizen, Maarten Breddels",
    author_email="mbuikhuizen@gmail.com, maartenbreddels@gmail.com",
    url="https://github.com/widgetto/ipyvue",
    keywords=[
        "ipython",
        "jupyter",
        "widgets",
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Framework :: IPython",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "Topic :: Multimedia :: Graphics",
        "Programming Language :: Python :: 2",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.3",
        "Programming Language :: Python :: 3.4",
        "Programming Language :: Python :: 3.5",
        "Programming Language :: Python :: 3.6",
    ],
)
