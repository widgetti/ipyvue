import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api
import traitlets
from IPython.display import display

import ipyvue as vue


class CounterTemplate(vue.VueTemplate):
    template = traitlets.Unicode(
        """
        <template>
            <button class="props-mode-btn" @click="$emit('update:count', count + 1)">
                clicked {{ count }} times
            </button>
        </template>
    """
    ).tag(sync=True)
    count = traitlets.Int(0).tag(sync=True)


def test_emit_update_sync(solara_test, page_session: playwright.sync_api.Page):
    # $emit("update:count", ...) is the explicit way to sync a trait back to
    # the model (the vue .sync/v-model contract), next to assigning the data
    widget = CounterTemplate()
    display(widget)

    button = page_session.locator(".props-mode-btn")
    button.click()
    page_session.locator("text=clicked 1 times").wait_for()
    assert widget.count == 1

    # model -> prop still flows down
    widget.count = 10
    page_session.locator("text=clicked 10 times").wait_for()


def test_emit_event(solara_test, page_session: playwright.sync_api.Page):
    class SaveTemplate(vue.VueTemplate):
        template = traitlets.Unicode(
            """
            <template>
                <button
                    class="props-mode-save"
                    @click="$emit('save', {reason: 'test'})"
                >
                    save {{ name }}
                </button>
            </template>
        """
        ).tag(sync=True)
        name = traitlets.Unicode("document").tag(sync=True)
        saved_with = traitlets.Dict(default_value=None, allow_none=True)

        def vue_save(self, data):
            self.saved_with = data

    widget = SaveTemplate()
    display(widget)

    button = page_session.locator(".props-mode-save")
    button.wait_for()
    button.click()
    page_session.wait_for_timeout(300)
    assert widget.saved_with == {"reason": "test"}


def test_data_assignment_unchanged(solara_test, page_session: playwright.sync_api.Page):
    # assigning to the two-way bound data keeps working (existing behavior)
    class DataCounter(vue.VueTemplate):
        template = traitlets.Unicode(
            """
            <template>
                <button class="data-mode-btn" @click="count = count + 1">
                    clicked {{ count }} times
                </button>
            </template>
        """
        ).tag(sync=True)
        count = traitlets.Int(0).tag(sync=True)

    widget = DataCounter()
    display(widget)

    button = page_session.locator(".data-mode-btn")
    button.click()
    page_session.locator("text=clicked 1 times").wait_for()
    assert widget.count == 1
