import pytest
import sys
from playwright.sync_api import Page
from traitlets import Unicode, default
from IPython.display import display

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import ipyvue as vue

SYNC_ERROR = "no comm channel defined"


class TickerTemplate(vue.VueTemplate):
    value = Unicode("").tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <span class="ticker-template">tick {{ value }}</span>
        </template>
        <script>
        export default {
            mounted() {
                let count = 0;
                this.interval = setInterval(() => {
                    count += 1;
                    this.value = "t" + count;
                }, 50);
            },
            beforeDestroy() {
                clearInterval(this.interval);
            },
        }
        </script>
        """


TICKER_COMPONENT = """
<template>
    <span class="ticker-component">tick {{ value }}</span>
</template>
<script>
module.exports = {
    props: ["value"],
    mounted() {
        let count = 0;
        this.interval = setInterval(() => {
            count += 1;
            this.$emit("input", "t" + count);
        }, 50);
    },
    beforeDestroy() {
        clearInterval(this.interval);
    },
}
</script>
"""


def _collect_errors(page: Page):
    messages = []

    def on_console(msg):
        messages.append(msg.text)

    def on_pageerror(error):
        messages.append(str(error))

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)

    def stop():
        page.remove_listener("console", on_console)
        page.remove_listener("pageerror", on_pageerror)

    return messages, stop


def _wait_for_sync(page: Page, get_value):
    for _ in range(50):
        if get_value():
            return
        page.wait_for_timeout(100)
    raise AssertionError("the frontend never synced a value to python")


def _assert_no_sync_error_after_close(page: Page, child):
    messages, stop = _collect_errors(page)
    try:
        # The parent does not change, so the child's Vue component stays
        # mounted and keeps writing to its closed model.
        child.close()
        page.wait_for_timeout(1000)
    finally:
        stop()
    errors = [m for m in messages if SYNC_ERROR in m]
    assert not errors, errors


# A template rendered inline in its parent writes a synced trait after the
# kernel closed its model: the write must be dropped, not raise.
def test_closed_template_model_does_not_sync(solara_test, page_session: Page):
    child = TickerTemplate()
    parent = vue.Html(tag="div", class_="closed-template-parent", children=[child])
    display(parent)

    page_session.locator(".closed-template-parent .ticker-template").wait_for()
    _wait_for_sync(page_session, lambda: child.value)
    _assert_no_sync_error_after_close(page_session, child)


# Same for a VueWidget whose v_model is written by a component after close.
def test_closed_widget_model_does_not_sync(solara_test, page_session: Page):
    vue.register_component_from_string("closed-model-ticker", TICKER_COMPONENT)
    child = vue.Html(tag="closed-model-ticker", v_model="")
    parent = vue.Html(tag="div", class_="closed-widget-parent", children=[child])
    display(parent)

    page_session.locator(".closed-widget-parent .ticker-component").wait_for()
    _wait_for_sync(page_session, lambda: child.v_model)
    _assert_no_sync_error_after_close(page_session, child)
