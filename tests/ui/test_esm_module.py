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
    names = list(vue.esm._module_names)
    widgets = dict(vue.esm._module_widgets)
    vue.esm._module_names.clear()
    vue.esm._module_widgets.clear()
    yield
    vue.esm._module_names[:] = names
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


def test_late_esm_module_plugin_rerenders_existing_templates(
    solara_test, page_session: playwright.sync_api.Page
):
    class Widget(vue.VueTemplate):
        template = traitlets.Unicode(
            """
            <template>
                <late-plugin-card></late-plugin-card>
            </template>
            """
        ).tag(sync=True)

    display(Widget())
    page_session.locator("late-plugin-card").wait_for(state="attached")

    vue.define_module(
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
    page_session.wait_for_function("window.__releaseLatePlugin !== undefined")
    page_session.evaluate("window.__releaseLatePlugin()")
    page_session.locator(".esm-late-plugin >> text=late plugin loaded").wait_for()


def test_late_esm_module_plugin_keeps_unrelated_local_state(
    solara_test, page_session: playwright.sync_api.Page
):
    local = vue.VueTemplate(
        template="""
        <template>
            <input class="plugin-local" v-model="local" />
        </template>
        <script>
            module.exports = {
                data() {
                    return { local: "" };
                },
            };
        </script>
        """,
    )
    waiting = vue.VueTemplate(
        template="""
        <template>
            <state-plugin-card></state-plugin-card>
        </template>
        """,
    )

    display(local)
    display(waiting)
    page_session.locator("state-plugin-card").wait_for(state="attached")
    page_session.locator(".plugin-local").fill("unsaved")

    vue.define_module(
        "esm-state-plugin-module",
        code="""
        import { h } from "vue";

        const StatePluginCard = {
            render() {
                return h("div", { class: "esm-state-plugin" }, "plugin loaded");
            },
        };

        export default {
            install(app) {
                app.component("StatePluginCard", StatePluginCard);
            },
        };
        """,
    )
    page_session.locator(".esm-state-plugin >> text=plugin loaded").wait_for()
    assert page_session.locator(".plugin-local").input_value() == "unsaved"


def _label_module(name, text, css_class):
    vue.define_module(
        name,
        code=f"""
        import {{ h }} from "vue";

        export const Label = {{
            render() {{
                return h("div", {{ class: "{css_class}" }}, "{text}");
            }},
        }};
        """,
    )


def test_esm_module_code_change_rerenders_mounted_template(
    solara_test, page_session: playwright.sync_api.Page
):
    _label_module("esm-hot-module", "v1", "esm-hot")

    class Widget(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-hot-module", esm_export="Label")

    display(Widget())
    page_session.locator(".esm-hot >> text=v1").wait_for()
    # redefine instead of setting .code: solara's define_module returns None
    _label_module("esm-hot-module", "v2", "esm-hot")
    page_session.locator(".esm-hot >> text=v2").wait_for()


def test_esm_module_code_change_rerenders_template_inside_vuetify(
    solara_test, page_session: playwright.sync_api.Page
):
    import ipyvuetify as v

    _label_module("esm-vuetify-module", "inside v1", "esm-vuetify")

    class Widget(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return vue.Template(esm_module="esm-vuetify-module", esm_export="Label")

    display(v.Container(children=[Widget()]))
    page_session.locator(".esm-vuetify >> text=inside v1").wait_for()
    _label_module("esm-vuetify-module", "inside v2", "esm-vuetify")
    page_session.locator(".esm-vuetify >> text=inside v2").wait_for()


def test_esm_module_code_change_rerenders_root_and_embedded_copy(
    solara_test, page_session: playwright.sync_api.Page
):
    import ipywidgets as widgets

    _label_module("esm-root-and-embedded-module", "copy v1", "esm-copy")

    class Widget(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-root-and-embedded-module",
                esm_export="Label",
            )

    widget = Widget()
    display(widget)
    display(widgets.VBox([widget]))
    page_session.wait_for_function(
        "document.querySelectorAll('.esm-copy').length === 2"
    )
    page_session.wait_for_function(
        "[...document.querySelectorAll('.esm-copy')]"
        ".filter(el => el.textContent.includes('copy v1')).length === 2"
    )

    _label_module("esm-root-and-embedded-module", "copy v2", "esm-copy")
    page_session.wait_for_function(
        "[...document.querySelectorAll('.esm-copy')]"
        ".filter(el => el.textContent.includes('copy v2')).length === 2"
    )


def test_esm_module_code_change_rerenders_root_and_jupyter_widget_copy(
    solara_test, page_session: playwright.sync_api.Page
):
    import ipywidgets as widgets

    _label_module("esm-root-and-jupyter-widget-module", "widget v1", "esm-jupyter")

    class Widget(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-root-and-jupyter-widget-module",
                esm_export="Label",
            )

    class Parent(vue.VueTemplate):
        child = traitlets.Any().tag(sync=True, **widgets.widget_serialization)
        template = traitlets.Unicode(
            """
            <template>
                <jupyter-widget :widget="child"></jupyter-widget>
            </template>
            """
        ).tag(sync=True)

    widget = Widget()
    display(widget)
    display(Parent(child=widget))
    page_session.wait_for_function(
        "[...document.querySelectorAll('.esm-jupyter')]"
        ".filter(el => el.textContent.includes('widget v1')).length === 2"
    )

    _label_module("esm-root-and-jupyter-widget-module", "widget v2", "esm-jupyter")
    page_session.wait_for_function(
        "[...document.querySelectorAll('.esm-jupyter')]"
        ".filter(el => el.textContent.includes('widget v2')).length === 2"
    )


def test_esm_module_code_change_rerenders_instance_component(
    solara_test, page_session: playwright.sync_api.Page
):
    _label_module("esm-inner-instance-module", "inner v1", "esm-inner-instance")

    class Inner(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-inner-instance-module",
                esm_export="Label",
            )

    outer = vue.VueTemplate(
        template="""
        <template>
            <inner></inner>
        </template>
        """,
        components={"inner": Inner()},
    )

    display(outer)
    page_session.locator(".esm-inner-instance >> text=inner v1").wait_for()
    _label_module("esm-inner-instance-module", "inner v2", "esm-inner-instance")
    page_session.locator(".esm-inner-instance >> text=inner v2").wait_for()


def test_hidden_esm_instance_component_uses_latest_module(
    solara_test, page_session: playwright.sync_api.Page
):
    _label_module("esm-hidden-instance-module", "hidden v1", "esm-hidden")

    class Child(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return vue.Template(
                esm_module="esm-hidden-instance-module",
                esm_export="Label",
            )

    class Parent(vue.VueTemplate):
        show = traitlets.Bool(True).tag(sync=True)

    parent = Parent(
        template="""
        <template>
            <div>
                <child v-if="show"></child>
            </div>
        </template>
        """,
        components={"child": Child()},
    )

    display(parent)
    page_session.locator(".esm-hidden >> text=hidden v1").wait_for()
    parent.show = False
    page_session.locator(".esm-hidden").wait_for(state="detached")
    _label_module("esm-hidden-instance-module", "hidden v2", "esm-hidden")
    parent.show = True
    page_session.locator(".esm-hidden >> text=hidden v2").wait_for()


def test_esm_components_change_rerenders_mounted_template(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-component-switch-module",
        code="""
        import { h } from "vue";

        export const One = {
            render() {
                return h("div", { class: "esm-component-switch" }, "one");
            },
        };

        export const Two = {
            render() {
                return h("div", { class: "esm-component-switch" }, "two");
            },
        };
        """,
    )

    widget = vue.VueTemplate(
        template="""
        <template>
            <switch-label></switch-label>
        </template>
        """,
        components={
            "switch-label": {
                "esm_module": "esm-component-switch-module",
                "esm_export": "One",
            }
        },
    )

    display(widget)
    page_session.locator(".esm-component-switch >> text=one").wait_for()
    widget.components = {
        "switch-label": {
            "esm_module": "esm-component-switch-module",
            "esm_export": "Two",
        }
    }
    page_session.locator(".esm-component-switch >> text=two").wait_for()


def test_esm_export_change_rerenders_mounted_template(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
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
    template = vue.Template(esm_module="esm-export-switch-module", esm_export="One")

    class Widget(vue.VueTemplate):
        @traitlets.default("template")
        def _template(self):
            return template

    display(Widget())
    page_session.locator(".esm-export >> text=one").wait_for()
    template.esm_export = "Two"
    page_session.locator(".esm-export >> text=two").wait_for()


def test_late_esm_module_plugin_rerenders_precompiled_resolve_component(
    solara_test, page_session: playwright.sync_api.Page
):
    vue.define_module(
        "esm-late-resolve-module",
        code="""
        import { h, resolveComponent } from "vue";

        export const Page = {
            render() {
                const LateTag = resolveComponent("late-tag");
                return h("div", { class: "esm-late-resolve" }, [h(LateTag)]);
            },
        };
        """,
    )

    display(
        vue.VueTemplate(
            template=vue.Template(
                esm_module="esm-late-resolve-module",
                esm_export="Page",
            )
        )
    )
    page_session.locator("late-tag").wait_for(state="attached")

    vue.define_module(
        "esm-late-resolve-plugin",
        code="""
        import { h } from "vue";

        await new Promise(resolve => { window.__releaseLateResolvePlugin = resolve; });

        const LateTag = {
            render() {
                return h("span", { class: "esm-late-resolved" }, "late resolved");
            },
        };

        export default {
            install(app) {
                app.component("late-tag", LateTag);
            },
        };
        """,
    )
    page_session.wait_for_function("window.__releaseLateResolvePlugin !== undefined")
    page_session.evaluate("window.__releaseLateResolvePlugin()")
    page_session.locator(".esm-late-resolved >> text=late resolved").wait_for()


def test_esm_module_dependency_change_retries_load(
    solara_test, page_session: playwright.sync_api.Page
):
    code = """
    import { h } from "vue";

    export const Label = {
        render() {
            return h("div", { class: "esm-dependency-retry" }, "dependency ready");
        },
    };
    """

    vue.define_module(
        "esm-dependency-retry-module",
        code=code,
        dependencies=["never-defined"],
    )

    display(
        vue.VueTemplate(
            template=vue.Template(
                esm_module="esm-dependency-retry-module",
                esm_export="Label",
            )
        )
    )
    vue.define_module("esm-dependency-retry-module", code=code, dependencies=[])
    page_session.locator(".esm-dependency-retry >> text=dependency ready").wait_for()


def test_plugin_module_code_change_rerenders_named_export(
    solara_test, page_session: playwright.sync_api.Page
):
    def plugin_module(text):
        vue.define_module(
            "esm-plugin-page-module",
            code=f"""
            import {{ h }} from "vue";

            export const Page = {{
                render() {{
                    return h("div", {{ class: "esm-plugin-page" }}, "{text}");
                }},
            }};

            export default {{
                install(app) {{
                    app.component("plugin-page-extra", {{
                        render() {{
                            return h("div", "extra");
                        }},
                    }});
                }},
            }};
            """,
        )

    plugin_module("plugin page v1")
    display(
        vue.VueTemplate(
            template=vue.Template(
                esm_module="esm-plugin-page-module",
                esm_export="Page",
            )
        )
    )
    page_session.locator(".esm-plugin-page >> text=plugin page v1").wait_for()
    plugin_module("plugin page v2")
    page_session.locator(".esm-plugin-page >> text=plugin page v2").wait_for()


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
