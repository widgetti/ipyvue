import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api
import traitlets
from IPython.display import display

import ipyvue as vue


@pytest.fixture(autouse=True)
def clean_module_registry():
    # define_module records module names process-wide (for dependency
    # ordering); tests each get a fresh page/kernel, so reset it
    names = list(vue.esm._module_names)
    vue.esm._module_names.clear()
    yield
    vue.esm._module_names[:] = names


def test_esm_module_plugin_registers_components(
    solara_test, page_session: playwright.sync_api.Page
):
    # the module registers its own components: the default export is a
    # plain vue plugin, Vue.use'd on load (vue2 has a global registry)
    vue.define_module(
        "esm-plugin-module",
        code="""
        import Vue from "vue";

        const Hello = {
            props: { name: { type: String, required: true } },
            render(h) {
                return h("div", { class: "esm-plugin-hello" }, `hello ${this.name}`);
            },
        };

        export default {
            install(vueOrApp) {
                vueOrApp.component("esm-hello", Hello);
            },
        };
        """,
    )

    class Widget(vue.VueTemplate):
        template = traitlets.Unicode(
            """
            <template>
                <esm-hello :name="name"></esm-hello>
            </template>
            """
        ).tag(sync=True)
        name = traitlets.Unicode("from python").tag(sync=True)

    display(Widget())
    page_session.locator(".esm-plugin-hello >> text=hello from python").wait_for()


def test_esm_module_component_as_tag(
    solara_test, page_session: playwright.sync_api.Page
):
    # an export used as a tag via the components dict: real props/emits,
    # loaded as a vue2 async component factory
    vue.define_module(
        "esm-click-module",
        code="""
        export const ClickButton = {
            props: { count: { type: Number, required: true } },
            render(h) {
                return h(
                    "button",
                    {
                        class: "esm-counter",
                        on: { click: () => this.$emit("bump", 1) },
                    },
                    `${this.count} clicks`,
                );
            },
        };
        """,
    )

    class Widget(vue.VueTemplate):
        template = traitlets.Unicode(
            """
            <template>
                <click-button :count="count" @bump="on_bump"></click-button>
            </template>
            """
        ).tag(sync=True)
        count = traitlets.Int(0).tag(sync=True)
        components = traitlets.Dict(
            {
                "click-button": {
                    "esm_module": "esm-click-module",
                    "esm_export": "ClickButton",
                }
            }
        ).tag(sync=True)

        def vue_on_bump(self, amount):
            self.count += amount

    display(Widget())
    counter = page_session.locator(".esm-counter")
    counter.click()
    page_session.locator(".esm-counter >> text=1 clicks").wait_for()
    counter.click()
    page_session.locator(".esm-counter >> text=2 clicks").wait_for()
