import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api

import ipyvue as vue


@pytest.fixture(autouse=True)
def clean_module_registry():
    names = list(vue.esm._module_names)
    widgets = dict(getattr(vue.esm, "_module_widgets", {}))
    vue.esm._module_names.clear()
    if hasattr(vue.esm, "_module_widgets"):
        vue.esm._module_widgets.clear()
    yield
    vue.esm._module_names[:] = names
    if hasattr(vue.esm, "_module_widgets"):
        vue.esm._module_widgets.clear()
        vue.esm._module_widgets.update(widgets)


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_esm_module_component(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    def kernel_code():
        import traitlets
        import ipyvue
        from ipywidgets import widget_serialization
        from IPython.display import display

        ipyvue.define_module(
            "esm-test-module",
            code="""
            import { h } from "vue";

            export const Label = {
                data: () => ({ msg: "placeholder" }),
                render() {
                    return h("div", { class: "esm-widget" }, this.msg);
                },
            };
            """,
        )

        class Widget(ipyvue.VueTemplate):
            template = traitlets.Any().tag(sync=True, **widget_serialization)
            msg = traitlets.Unicode("from python").tag(sync=True)

            @traitlets.default("template")
            def _template(self):
                return ipyvue.Template(esm_module="esm-test-module", esm_export="Label")

        display(Widget())

    ipywidgets_runner(kernel_code)
    # the model mixin must override the module's own data() placeholder
    page_session.locator(".esm-widget >> text=from python").wait_for()


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_esm_module_component_as_tag(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    def kernel_code():
        import traitlets
        import ipyvue
        from ipywidgets import widget_serialization
        from IPython.display import display

        ipyvue.define_module(
            "esm-click-module",
            code="""
            import { h } from "vue";

            export const ClickButton = {
                props: { count: { type: Number, required: true } },
                emits: ["bump"],
                render() {
                    return h(
                        "button",
                        { class: "esm-counter", onClick: () => this.$emit("bump", 1) },
                        `${this.count} clicks`,
                    );
                },
            };
            """,
        )

        class Widget(ipyvue.VueTemplate):
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
            ).tag(sync=True, **widget_serialization)

            def vue_on_bump(self, amount):
                self.count += amount

        display(Widget())

    ipywidgets_runner(kernel_code)
    # props flow in (count), events flow out (@bump -> python -> count += 1)
    counter = page_session.locator(".esm-counter")
    counter.click()
    page_session.locator(".esm-counter >> text=1 clicks").wait_for()
    counter.click()
    page_session.locator(".esm-counter >> text=2 clicks").wait_for()


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_esm_module_plugin_registers_components(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    def kernel_code():
        import traitlets
        import ipyvue
        from IPython.display import display

        # the module registers its own components: the default export is a
        # plain vue plugin, applied to every app
        ipyvue.define_module(
            "esm-plugin-module",
            code="""
            import { h } from "vue";

            const Hello = {
                props: { name: { type: String, required: true } },
                render() {
                    const text = `hello ${this.name}`;
                    return h("div", { class: "esm-plugin-hello" }, text);
                },
            };

            export default {
                install(app) {
                    app.component("esm-hello", Hello);
                },
            };
            """,
        )

        class Widget(ipyvue.VueTemplate):
            template = traitlets.Unicode(
                """
                <template>
                    <esm-hello :name="name"></esm-hello>
                </template>
                """
            ).tag(sync=True)
            name = traitlets.Unicode("from python").tag(sync=True)

        display(Widget())

    ipywidgets_runner(kernel_code)
    page_session.locator(".esm-plugin-hello >> text=hello from python").wait_for()


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_late_esm_module_plugin_rerenders_existing_templates(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    def kernel_code():
        import traitlets
        import ipyvue
        from ipywidgets import widget_serialization
        from IPython.display import display

        ipyvue.define_module(
            "esm-late-plugin-module",
            code="""
            import { h } from "vue";

            await new Promise(resolve => { window.__releaseLatePlugin = resolve; });

            const LatePluginCard = {
                render() {
                    return h("div", { class: "esm-late-plugin" }, "late plugin loaded");
                },
            };

            export default {
                install(app) {
                    app.component("LatePluginCard", LatePluginCard);
                },
            };
            """,
        )

        class Widget(ipyvue.VueTemplate):
            template = traitlets.Any().tag(sync=True, **widget_serialization)

            @traitlets.default("template")
            def _template(self):
                return ipyvue.Template(
                    template="""
                    <template>
                        <late-plugin-card></late-plugin-card>
                    </template>
                    """
                )

        display(Widget())

    ipywidgets_runner(kernel_code)
    page_session.locator("late-plugin-card").wait_for(state="attached")
    page_session.wait_for_function("window.__releaseLatePlugin !== undefined")
    page_session.evaluate("window.__releaseLatePlugin()")
    page_session.locator(".esm-late-plugin >> text=late plugin loaded").wait_for()


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_esm_module_code_change_rerenders_mounted_template(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    holder = {}

    def kernel_code():
        import traitlets
        import ipyvue
        from ipywidgets import widget_serialization
        from IPython.display import display

        module = ipyvue.define_module(
            "esm-hot-module",
            code="""
            import { h } from "vue";

            export const Label = {
                render() {
                    return h("div", { class: "esm-hot" }, "v1");
                },
            };
            """,
        )
        holder["module"] = module

        class Widget(ipyvue.VueTemplate):
            template = traitlets.Any().tag(sync=True, **widget_serialization)

            @traitlets.default("template")
            def _template(self):
                return ipyvue.Template(esm_module="esm-hot-module", esm_export="Label")

        display(Widget())

    ipywidgets_runner(kernel_code)
    page_session.locator(".esm-hot >> text=v1").wait_for()
    holder[
        "module"
    ].code = """
    import { h } from "vue";

    export const Label = {
        render() {
            return h("div", { class: "esm-hot" }, "v2");
        },
    };
    """
    page_session.locator(".esm-hot >> text=v2").wait_for()


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_esm_export_change_rerenders_mounted_template(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    holder = {}

    def kernel_code():
        import traitlets
        import ipyvue
        from ipywidgets import widget_serialization
        from IPython.display import display

        ipyvue.define_module(
            "esm-export-switch-module",
            code="""
            import { h } from "vue";

            export const One = {
                render() {
                    return h("div", { class: "esm-export" }, "one");
                },
            };

            export const Two = {
                render() {
                    return h("div", { class: "esm-export" }, "two");
                },
            };
            """,
        )

        class Widget(ipyvue.VueTemplate):
            template = traitlets.Any().tag(sync=True, **widget_serialization)

            @traitlets.default("template")
            def _template(self):
                return ipyvue.Template(
                    esm_module="esm-export-switch-module",
                    esm_export="One",
                )

        widget = Widget()
        holder["template"] = widget.template

        display(widget)

    ipywidgets_runner(kernel_code)
    page_session.locator(".esm-export >> text=one").wait_for()
    holder["template"].esm_export = "Two"
    page_session.locator(".esm-export >> text=two").wait_for()


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_esm_module_code_change_while_consumer_waits(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    def kernel_code():
        import traitlets
        import ipyvue
        from ipywidgets import widget_serialization
        from IPython.display import display

        module = ipyvue.define_module(
            "esm-replaced-module",
            code="""
            import { h } from "vue";

            export const Label = {
                render() {
                    return h("div", { class: "esm-replaced" }, "old code");
                },
            };
            """,
            dependencies=["pending-gate-module"],
        )

        class Widget(ipyvue.VueTemplate):
            template = traitlets.Any().tag(sync=True, **widget_serialization)

            @traitlets.default("template")
            def _template(self):
                return ipyvue.Template(
                    esm_module="esm-replaced-module",
                    esm_export="Label",
                )

        display(Widget())
        module.dependencies = []
        module.code = """
        import { h } from "vue";

        export const Label = {
            render() {
                return h("div", { class: "esm-replaced" }, "new code");
            },
        };
        """

    ipywidgets_runner(kernel_code)
    page_session.locator(".esm-replaced >> text=new code").wait_for()
