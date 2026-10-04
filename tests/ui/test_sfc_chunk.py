"""The SFC compiler (@vue/compiler-sfc) is a lazy chunk named vue-sfc. The
first template on a page loads it, once, and every template renders as before.
sucrase is a second lazy chunk, vue-sfc-ts, which only <script lang="ts"> loads."""

import re
import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api


PLAIN = """
<template>
    <div class="plain-tpl" @click="click">Plain {{ clicks }} {{ extra }}</div>
</template>
<script>
module.exports = {
    data: () => ({ extra: "from-script" }),
    methods: { click() { this.clicks += 1; } },
}
</script>
<style>
.plain-tpl { color: rgb(255, 0, 0); }
</style>
"""

PLAIN_2 = """
<template>
    <div class="plain-tpl-2">Second {{ label }}</div>
</template>
"""

PLAIN_3 = """
<template>
    <span class="plain-tpl-3">Third template</span>
</template>
"""

SETUP_TS = """
<template>
    <div class="setup-tpl">{{ msg }}</div>
</template>
<script setup lang="ts">
import { ref } from "vue";
const msg = ref<string>("setup-" + (1 as number));
</script>
<style scoped>
.setup-tpl { color: rgb(0, 128, 0); }
</style>
"""

UNDERSCORE = """
<template>
    <div class="underscore-tpl">{{ _label() }}</div>
</template>
<script>
module.exports = {
    methods: { _label() { return "underscore-method"; } },
}
</script>
"""

ADD_BUTTON = "Add a template"

CHUNK_URL = re.compile(r"vue-sfc[^/]*\.js")
TS_CHUNK_URL = re.compile(r"vue-sfc-ts[^/]*\.js")
CHUNK_SCRIPT_GONE = "!document.querySelector('script[src*=\"vue-sfc\"]')"

RECORD_CHUNK_LOADS = """(() => {
    if (!window.__ipyvueChunkLoads) {
        window.__ipyvueChunkLoads = [];
        window.addEventListener("jupyter-vue:load-chunk", (event) => {
            window.__ipyvueChunkLoads.push(event.detail);
        });
    }
})()"""


@pytest.fixture(autouse=True)
def record_chunk_loads(page_session: playwright.sync_api.Page):
    """Lists the chunks that jupyter-vue asks for on the page, from its
    jupyter-vue:load-chunk event. Counting network requests does not work: a host
    can preload the chunk. This fixture runs before ipywidgets_runner opens the
    page, so the list starts at page load: on the solara runner, Solara's own
    navigator.vue loads the chunk before the test code runs."""
    page_session.add_init_script(RECORD_CHUNK_LOADS)


def chunk_loads(page: playwright.sync_api.Page):
    return page.evaluate("window.__ipyvueChunkLoads.map((detail) => detail.chunk)")


@pytest.fixture
def ts_chunk_requests(page_session: playwright.sync_api.Page):
    """Lists the requests for the vue-sfc-ts chunk (sucrase). No host preloads
    this chunk, so the network requests count. Put this fixture before
    ipywidgets_runner, which opens the page."""
    urls = []

    def on_request(request):
        if TS_CHUNK_URL.search(request.url):
            urls.append(request.url)

    page_session.on("request", on_request)
    try:
        yield urls
    finally:
        page_session.remove_listener("request", on_request)


def test_plain_templates_load_sfc_chunk_once(
    ipywidgets_runner, page_session: playwright.sync_api.Page
):
    def kernel_code():
        import ipyvue as vue
        import ipywidgets as widgets
        import traitlets
        from IPython.display import display
        from test_sfc_chunk import PLAIN, PLAIN_2, PLAIN_3

        class Plain(vue.VueTemplate):
            clicks = traitlets.Int(0).tag(sync=True)
            template = traitlets.Unicode(PLAIN).tag(sync=True)

        class Plain2(vue.VueTemplate):
            label = traitlets.Unicode("from-trait").tag(sync=True)
            template = traitlets.Unicode(PLAIN_2).tag(sync=True)

        class Plain3(vue.VueTemplate):
            template = traitlets.Unicode(PLAIN_3).tag(sync=True)

        display(widgets.VBox([Plain(), Plain2(), Plain3()]))

    ipywidgets_runner(kernel_code)
    page_session.locator("text=Plain 0 from-script").click()
    page_session.locator("text=Plain 1 from-script").wait_for()
    page_session.locator("text=Second from-trait").wait_for()
    page_session.locator("text=Third template").wait_for()
    color = page_session.locator(".plain-tpl").evaluate(
        "e => getComputedStyle(e).color"
    )
    assert color == "rgb(255, 0, 0)"
    assert chunk_loads(page_session) == ["vue-sfc"]


def test_script_setup_ts_loads_both_chunks(
    ts_chunk_requests, ipywidgets_runner, page_session: playwright.sync_api.Page
):
    def kernel_code():
        import ipyvue as vue
        import traitlets
        from IPython.display import display
        from test_sfc_chunk import SETUP_TS

        class Setup(vue.VueTemplate):
            template = traitlets.Unicode(SETUP_TS).tag(sync=True)

        display(Setup())

    ipywidgets_runner(kernel_code)
    page_session.locator("text=setup-1").wait_for()
    color = page_session.locator(".setup-tpl").evaluate(
        "e => getComputedStyle(e).color"
    )
    assert color == "rgb(0, 128, 0)"
    assert chunk_loads(page_session) == ["vue-sfc"]
    assert len(ts_chunk_requests) == 1, ts_chunk_requests


def test_plain_template_does_not_load_ts_chunk(
    ts_chunk_requests, ipywidgets_runner, page_session: playwright.sync_api.Page
):
    def kernel_code():
        import ipyvue as vue
        import traitlets
        from IPython.display import display
        from test_sfc_chunk import PLAIN

        class Plain(vue.VueTemplate):
            clicks = traitlets.Int(0).tag(sync=True)
            template = traitlets.Unicode(PLAIN).tag(sync=True)

        display(Plain())

    ipywidgets_runner(kernel_code)
    page_session.locator("text=Plain 0 from-script").wait_for()
    assert chunk_loads(page_session) == ["vue-sfc"]
    assert ts_chunk_requests == []


def test_underscore_method_renders(
    ipywidgets_runner, page_session: playwright.sync_api.Page
):
    def kernel_code():
        import ipyvue as vue
        import traitlets
        from IPython.display import display
        from test_sfc_chunk import UNDERSCORE

        class Underscore(vue.VueTemplate):
            template = traitlets.Unicode(UNDERSCORE).tag(sync=True)

        display(Underscore())

    ipywidgets_runner(kernel_code)
    page_session.locator("text=underscore-method").wait_for()
    assert chunk_loads(page_session) == ["vue-sfc"]


def test_template_after_failed_chunk_load(
    ipywidgets_runner, page_session: playwright.sync_api.Page
):
    # the first chunk request fails, so the first template does not render; a
    # later template loads the chunk again
    failed = []

    def fail_once(route):
        if not failed:
            failed.append(route.request.url)
            route.abort()
        else:
            route.continue_()

    def kernel_code():
        import ipyvue as vue
        import ipywidgets as widgets
        import traitlets
        from IPython.display import display
        from test_sfc_chunk import ADD_BUTTON, PLAIN_3

        class Plain3(vue.VueTemplate):
            template = traitlets.Unicode(PLAIN_3).tag(sync=True)

        box = widgets.VBox([Plain3()])
        button = widgets.Button(description=ADD_BUTTON)

        def add(_button):
            box.children = box.children + (Plain3(),)

        button.on_click(add)
        display(widgets.VBox([button, box]))

    page_session.route(CHUNK_URL, fail_once)
    try:
        ipywidgets_runner(kernel_code)
        add_button = page_session.get_by_role("button", name=ADD_BUTTON)
        add_button.wait_for()
        for _ in range(100):
            # webpack removes the script tag of a chunk that failed to load
            if failed and page_session.evaluate(CHUNK_SCRIPT_GONE):
                break
            if not failed and page_session.locator(".plain-tpl-3").count():
                # the solara runner: Solara's navigator.vue loaded it with the page
                pytest.skip("the page loaded the chunk before the test")
            page_session.wait_for_timeout(100)
        assert failed, "the page did not request the vue-sfc chunk"
        add_button.click()
        page_session.locator(".plain-tpl-3").wait_for()
        assert chunk_loads(page_session) == ["vue-sfc", "vue-sfc"]
    finally:
        page_session.unroute(CHUNK_URL, fail_once)
