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


def test_esm_template_in_vuetify_widget(
    solara_test, page_session: playwright.sync_api.Page
):
    # embedders (ipyvuetify views, solara's widget mount point) render
    # through cached vnodes; the esm component must still appear once its
    # module loads
    v = pytest.importorskip("ipyvuetify")

    vue.define_module(
        "esm-vuetify-module",
        code="""
        export const Hello = {
            data() { return { label: "placeholder" }; },
            template: `<div class="esm-vuetify-hello">hello {{ label }}</div>`,
        };
        """,
    )

    class Widget(v.VuetifyTemplate):
        label = traitlets.Unicode("from python").tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-vuetify-module", esm_export="Hello")

    display(Widget())
    page_session.locator(".esm-vuetify-hello >> text=hello from python").wait_for()


def test_esm_module_as_template_implementation(
    solara_test, page_session: playwright.sync_api.Page
):
    # an export used as a VueTemplate implementation: the model mixin merges
    # under it, so traits override the script's data() placeholders (down),
    # assignment in the template syncs back (up), and injected event
    # handlers override method stubs
    vue.define_module(
        "esm-template-module",
        code="""
        export const Counter = {
            data() {
                return { count: 0, label: "placeholder" };
            },
            methods: {
                save() {
                    throw new Error("save is injected by python (vue_save)");
                },
            },
            template: `
                <div>
                    <button class="esm-tpl-bump" @click="count = count + 1">
                        {{ label }} {{ count }}
                    </button>
                    <button class="esm-tpl-save" @click="save(count)">save</button>
                </div>
            `,
        };
        """,
    )

    class Widget(vue.VueTemplate):
        count = traitlets.Int(10).tag(sync=True)
        label = traitlets.Unicode("from python").tag(sync=True)
        saved = traitlets.Int(-1)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-template-module", esm_export="Counter")

        def vue_save(self, value):
            self.saved = value

    widget = Widget()
    display(widget)

    # traits win over the script's data() placeholders
    bump = page_session.locator(".esm-tpl-bump")
    bump.wait_for()
    page_session.locator("text=from python 10").wait_for()

    # write-back: template assignment syncs to python
    bump.click()
    page_session.locator("text=from python 11").wait_for()
    assert widget.count == 11

    # injected event handler overrides the throwing stub
    page_session.locator(".esm-tpl-save").click()
    page_session.wait_for_timeout(300)
    assert widget.saved == 11

    # python -> template still flows down
    widget.count = 42
    page_session.locator("text=from python 42").wait_for()
