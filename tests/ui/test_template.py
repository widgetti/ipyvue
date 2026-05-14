import pytest
import sys
import threading

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import ipyvue as vue
import ipywidgets as widgets
import playwright.sync_api

from IPython.display import display
from traitlets import default, Any, Int, Callable, Unicode


class MyTemplate(vue.VueTemplate):
    clicks = Int(0).tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div @click="clicks += 1">Clicked {{clicks}}</div>
        </template>
        """


def test_template(ipywidgets_runner, page_session: playwright.sync_api.Page):
    def kernel_code():
        # this import is need so when this code executes in the kernel,
        # the class is imported
        from test_template import MyTemplate

        widget = MyTemplate()
        display(widget)

    ipywidgets_runner(kernel_code)
    widget = page_session.locator("text=Clicked 0")
    widget.wait_for()
    widget.click()
    page_session.locator("text=Clicked 1").wait_for()


class EmbedsWidgetTemplate(vue.VueTemplate):
    child = Any().tag(sync=True, **widgets.widget_serialization)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div>
                <jupyter-widget :widget="child"></jupyter-widget>
            </div>
        </template>
        """


def test_template_embeds_jupyter_widget(
    ipywidgets_runner, page_session: playwright.sync_api.Page
):
    def kernel_code():
        from test_template import EmbedsWidgetTemplate
        import ipywidgets as widgets

        widget = EmbedsWidgetTemplate(
            child=widgets.IntSlider(description="Embedded slider", value=7)
        )
        display(widget)

    ipywidgets_runner(kernel_code)
    page_session.locator("text=Embedded slider").wait_for()


class MyEventTemplate(vue.VueTemplate):
    on_custom = Callable()
    text = Unicode("Click Me").tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div @click="custom_event('not-an-event-object')">{{text}}</div>
        </template>
        """

    def vue_custom_event(self, data):
        self.on_custom(data)


def test_template_custom_event(solara_test, page_session: playwright.sync_api.Page):
    last_event_data = None

    def on_custom(data):
        nonlocal last_event_data
        last_event_data = data
        div.text = "Clicked"

    div = MyEventTemplate(on_custom=on_custom)

    display(div)

    page_session.locator("text=Click Me").click()
    page_session.locator("text=Clicked").wait_for()
    assert last_event_data == "not-an-event-object"


class StyledTemplate(vue.VueTemplate):
    @default("template")
    def _default_styled_template(self):
        return """
        <template>
            <div class="style-leak-target">Styled</div>
        </template>
        <style>
            .style-leak-target {
                color: rgb(255, 0, 0);
            }
        </style>
        """


def test_template_style_update_replaces_old_styles(
    solara_test, page_session: playwright.sync_api.Page
):
    widget = StyledTemplate()

    display(widget)

    target = page_session.locator(".style-leak-target")
    target.wait_for()
    expect_red = """
        () => {
            const el = document.querySelector('.style-leak-target');
            return el && getComputedStyle(el).color === 'rgb(255, 0, 0)';
        }
    """
    page_session.wait_for_function(expect_red)

    def update_template():
        widget.template = """
        <template>
            <div class="style-leak-target">Unstyled</div>
        </template>
        """

    threading.Timer(0.5, update_template).start()

    page_session.locator("text=Unstyled").wait_for()
    page_session.wait_for_function(
        """
        () => {
            const el = document.querySelector('.style-leak-target');
            return el && getComputedStyle(el).color !== 'rgb(255, 0, 0)';
        }
    """
    )
