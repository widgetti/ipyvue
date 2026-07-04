import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api
import traitlets
from IPython.display import display

import ipyvue as vue


class PropsCounter(vue.VueTemplate):
    template = traitlets.Unicode(
        """
        <template>
            <div>
                <button
                    class="props-emit-btn"
                    @click="$emit('update:count', count + 1)"
                >
                    emit {{ count }}
                </button>
                <button class="props-assign-btn" @click="count = count + 100">
                    assign
                </button>
            </div>
        </template>
        <script>
        export default {
            props: ["count"],
        };
        </script>
    """
    ).tag(sync=True)
    count = traitlets.Int(0).tag(sync=True)


def test_template_props_honored(solara_test, page_session: playwright.sync_api.Page):
    # with template_props_support, props declared in the template's <script>
    # are honored: count arrives as a one-way prop, $emit("update:count")
    # syncs it back, and direct assignment no longer reaches Python
    widget = PropsCounter(template_props_support=True)
    display(widget)

    button = page_session.locator(".props-emit-btn")
    button.click()
    page_session.locator("text=emit 1").wait_for()
    assert widget.count == 1

    # model -> prop still flows down
    widget.count = 10
    page_session.locator("text=emit 10").wait_for()

    # assignment to a prop does not sync back (vue warns instead)
    page_session.locator(".props-assign-btn").click()
    page_session.wait_for_timeout(300)
    assert widget.count == 10


def test_template_props_ignored_by_default(
    solara_test, page_session: playwright.sync_api.Page
):
    # without the opt-in, declared props stay ignored and the trait is
    # two-way bound data (existing behavior, e.g. dual-use templates)
    widget = PropsCounter()
    display(widget)

    page_session.locator(".props-assign-btn").click()
    page_session.locator("text=emit 100").wait_for()
    assert widget.count == 100
