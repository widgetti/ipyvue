import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api
import traitlets
import ipywidgets as widgets
from IPython.display import display

import ipyvue as vue
import ipyvue.esm as esm


def _module_registries():
    # define_module records modules process-wide (for dependency ordering),
    # and so does solara's replacement of it; every test gets a fresh page,
    # so a module left over from an earlier test (e.g. one that never
    # finishes loading) must not become a dependency of later modules
    registries = [esm._module_names, esm._module_widgets]
    try:
        import solara.server.esm_vue as solara_esm_vue
    except ImportError:
        pass
    else:
        registries += [
            solara_esm_vue._modules,
            solara_esm_vue._modules_added_per_kernel,
        ]
    return registries


@pytest.fixture(autouse=True)
def clean_module_registry():
    registries = _module_registries()
    saved = [registry.copy() for registry in registries]
    for registry in registries:
        registry.clear()
    yield
    for registry, copy in zip(registries, saved):
        registry.clear()
        if isinstance(registry, list):
            registry.extend(copy)
        else:
            registry.update(copy)


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


def test_esm_module_late_plugin_refreshes_existing_template(
    solara_test, page_session: playwright.sync_api.Page
):
    class Widget(vue.VueTemplate):
        template = traitlets.Unicode(
            """
            <template>
                <esm-late-plugin-hello name="late"></esm-late-plugin-hello>
            </template>
            """
        ).tag(sync=True)

    display(Widget())
    page_session.locator("esm-late-plugin-hello").wait_for(state="attached")

    vue.define_module(
        "esm-late-plugin-module",
        code="""
        import Vue from "vue";

        await new Promise(resolve => { window.__releaseLatePlugin = resolve; });

        const Hello = {
            props: { name: { type: String, required: true } },
            render(h) {
                return h(
                    "div",
                    { class: "esm-late-plugin-hello" },
                    `plugin ${this.name}`,
                );
            },
        };

        export default {
            install(vueOrApp) {
                vueOrApp.component("esm-late-plugin-hello", Hello);
            },
        };
        """,
    )
    page_session.wait_for_function("typeof window.__releaseLatePlugin === 'function'")
    page_session.evaluate("window.__releaseLatePlugin()")
    page_session.locator(".esm-late-plugin-hello >> text=plugin late").wait_for()


def test_esm_module_plugin_reload_refreshes_replaced_component(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-reload-plugin-module",
        code="""
        import Vue from "vue";

        export default {
            install(vueOrApp) {
                vueOrApp.component("esm-reload-tag", {
                    render(h) {
                        return h("div", { class: "esm-reload-tag" }, "reload v1");
                    },
                });
            },
        };
        """,
    )

    class Widget(vue.VueTemplate):
        template = traitlets.Unicode(
            """
            <template>
                <esm-reload-tag></esm-reload-tag>
            </template>
            """
        ).tag(sync=True)

    display(Widget())
    page_session.locator(".esm-reload-tag >> text=reload v1").wait_for()

    vue.define_module(
        "esm-reload-plugin-module",
        code="""
        import Vue from "vue";

        export default {
            install(vueOrApp) {
                vueOrApp.component("esm-reload-tag", {
                    render(h) {
                        return h("div", { class: "esm-reload-tag" }, "reload v2");
                    },
                });
                vueOrApp.component("esm-reload-extra-tag", {
                    render(h) {
                        return h("div", { class: "esm-reload-extra-tag" }, "extra");
                    },
                });
            },
        };
        """,
    )
    page_session.locator(".esm-reload-tag >> text=reload v2").wait_for()


def test_esm_module_late_plugin_refreshes_esm_template_export(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-late-tag-template-module",
        code="""
        export const Host = {
            template: `<esm-late-tag name="esm"></esm-late-tag>`,
        };
        """,
    )

    class Widget(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-late-tag-template-module", esm_export="Host"
            )

    display(Widget())
    page_session.locator("esm-late-tag").wait_for(state="attached")

    vue.define_module(
        "esm-late-tag-plugin-module",
        code="""
        import Vue from "vue";

        await new Promise(resolve => { window.__releaseLateEsmTagPlugin = resolve; });

        export default {
            install(vueOrApp) {
                vueOrApp.component("esm-late-tag", {
                    props: { name: { type: String, required: true } },
                    render(h) {
                        return h(
                            "div",
                            { class: "esm-late-tag" },
                            `late ${this.name}`,
                        );
                    },
                });
            },
        };
        """,
    )
    page_session.wait_for_function(
        "typeof window.__releaseLateEsmTagPlugin === 'function'"
    )
    page_session.evaluate("window.__releaseLateEsmTagPlugin()")
    page_session.locator(".esm-late-tag >> text=late esm").wait_for()


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
            // props declarations (e.g. written for type checkers) must not
            // shadow the model data
            props: { label: { type: String, default: "" } },
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


def test_esm_module_provided_after_request(
    solara_test, page_session: playwright.sync_api.Page
):
    # the widget can arrive (and render) before its module does: the
    # pending request must resolve when the module is provided later
    class Widget(vue.VueTemplate):
        label = traitlets.Unicode("late").tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-late-module", esm_export="Hello")

    display(Widget())
    # make sure the widget rendered (as an empty placeholder) before the
    # module exists
    page_session.locator("text=module defined").wait_for(state="detached")
    page_session.wait_for_timeout(300)

    vue.define_module(
        "esm-late-module",
        code="""
        export const Hello = {
            data() {
                return { label: "placeholder" };
            },
            template: `<div class="esm-late">module defined {{ label }}</div>`,
        };
        """,
    )
    page_session.locator(".esm-late >> text=module defined late").wait_for()


def test_esm_module_code_change_resolves_existing_waiter(
    solara_test, page_session: playwright.sync_api.Page
):
    class Widget(vue.VueTemplate):
        label = traitlets.Unicode("hot").tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-hot-module", esm_export="Hello")

    display(Widget())
    page_session.locator("text=new code").wait_for(state="detached")

    vue.define_module(
        "esm-hot-module",
        code="""
        window.__ipyvueHotOldStarted = true;
        await new Promise(() => {});

        export const Hello = {
            template: `<div class="esm-hot">old code {{ label }}</div>`,
        };
        """,
    )
    page_session.wait_for_function("window.__ipyvueHotOldStarted === true")

    vue.define_module(
        "esm-hot-module",
        code="""
        export const Hello = {
            template: `<div class="esm-hot">new code {{ label }}</div>`,
        };
        """,
    )

    page_session.locator(".esm-hot >> text=new code hot").wait_for()


def test_esm_template_module_code_change_refreshes_mounted_view(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-refresh-module",
        code="""
        export const Hello = {
            template: `<div class="esm-refresh">v1 {{ label }}</div>`,
        };
        """,
    )

    class Widget(vue.VueTemplate):
        label = traitlets.Unicode("hot").tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-refresh-module", esm_export="Hello")

    display(Widget())
    page_session.locator(".esm-refresh >> text=v1 hot").wait_for()

    # redefine instead of setting .code: solara's define_module returns None
    vue.define_module(
        "esm-refresh-module",
        code="""
        export const Hello = {
            template: `<div class="esm-refresh">v2 {{ label }}</div>`,
        };
        """,
    )
    page_session.locator(".esm-refresh >> text=v2 hot").wait_for()


def test_esm_template_export_change_refreshes_mounted_view(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-export-refresh-module",
        code="""
        export const First = {
            template: `<div class="esm-export-refresh">first {{ label }}</div>`,
        };
        export const Second = {
            template: `<div class="esm-export-refresh">second {{ label }}</div>`,
        };
        """,
    )

    class Widget(vue.VueTemplate):
        label = traitlets.Unicode("export").tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-export-refresh-module", esm_export="First"
            )

    widget = Widget()
    display(widget)
    page_session.locator(".esm-export-refresh >> text=first export").wait_for()

    widget.template.esm_export = "Second"
    page_session.locator(".esm-export-refresh >> text=second export").wait_for()


def test_esm_template_components_change_refreshes_mounted_view(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-components-host-module",
        code="""
        export const Host = {
            template: `<swap-child></swap-child>`,
        };
        """,
    )
    vue.define_module(
        "esm-components-child-module",
        code="""
        export const First = {
            template: `<div class="esm-components-swap">first child</div>`,
        };
        export const Second = {
            template: `<div class="esm-components-swap">second child</div>`,
        };
        """,
    )

    class Widget(vue.VueTemplate):
        components = traitlets.Dict(
            {
                "swap-child": {
                    "esm_module": "esm-components-child-module",
                    "esm_export": "First",
                }
            }
        ).tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-components-host-module", esm_export="Host"
            )

    widget = Widget()
    display(widget)
    page_session.locator(".esm-components-swap >> text=first child").wait_for()

    widget.components = {
        "swap-child": {
            "esm_module": "esm-components-child-module",
            "esm_export": "Second",
        }
    }
    page_session.locator(".esm-components-swap >> text=second child").wait_for()


def test_esm_template_esm_tag_module_reload_refreshes_mounted_view(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-parent-tag-module",
        code="""
        export const Host = {
            template: `<lib-tag></lib-tag>`,
        };
        """,
    )
    vue.define_module(
        "esm-lib-tag-module",
        code="""
        export const LibTag = {
            template: `<div class="esm-lib-tag">lib v1</div>`,
        };
        """,
    )

    class Widget(vue.VueTemplate):
        components = traitlets.Dict(
            {
                "lib-tag": {
                    "esm_module": "esm-lib-tag-module",
                    "esm_export": "LibTag",
                }
            }
        ).tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-parent-tag-module", esm_export="Host")

    display(Widget())
    page_session.locator(".esm-lib-tag >> text=lib v1").wait_for()

    vue.define_module(
        "esm-lib-tag-module",
        code="""
        export const LibTag = {
            template: `<div class="esm-lib-tag">lib v2</div>`,
        };
        """,
    )
    page_session.locator(".esm-lib-tag >> text=lib v2").wait_for()


def test_esm_template_missing_export_does_not_break_sibling_then_recovers(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-missing-export-module",
        code="""
        export const Present = {
            template: `<div class="esm-present-export">present {{ label }}</div>`,
        };
        """,
    )

    class Child(vue.VueTemplate):
        label = traitlets.Unicode("child").tag(sync=True)

        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-missing-export-module", esm_export="Missing"
            )

    class Parent(vue.VueTemplate):
        child = traitlets.Instance(widgets.Widget, allow_none=True).tag(
            sync=True, **widgets.widget_serialization
        )
        template = traitlets.Unicode(
            """
            <template>
                <div>
                    <div class="esm-missing-sibling">sibling still renders</div>
                    <jupyter-widget :widget="child"></jupyter-widget>
                </div>
            </template>
            """
        ).tag(sync=True)

    child = Child()
    display(Parent(child=child))
    page_session.locator(
        ".esm-missing-sibling >> text=sibling still renders"
    ).wait_for()
    page_session.locator(".esm-present-export").wait_for(state="detached")

    child.template.esm_export = "Present"
    page_session.locator(".esm-present-export >> text=present child").wait_for()


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
