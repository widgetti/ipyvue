import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api


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
            """
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
            """
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
