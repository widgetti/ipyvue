import pytest
import sys
import re

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import ipyvue as vue
import playwright.sync_api
from playwright.sync_api import expect

from IPython.display import display
from traitlets import default, Unicode, Instance
import ipywidgets as widgets


class MyTemplate(vue.VueTemplate):
    class_ = Unicode("template-parent").tag(sync=True)
    child = Instance(widgets.Widget, allow_none=True).tag(
        sync=True, **widgets.widget_serialization
    )
    text = Unicode(None, allow_none=True).tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div :class="class_">
                <span v-if="text">{{text}}</span>
                <jupyter-widget v-if="child" :widget="child"></jupyter-widget>
            </div>
        </template>
        """


@pytest.mark.parametrize("parent_is_template", [True, False])
def test_vue_with_vue_widget_child(
    ipywidgets_runner, page_session: playwright.sync_api.Page, parent_is_template
):
    def kernel_code():
        from test_nested import MyTemplate
        import ipyvue as vue

        child = vue.Html(tag="div", children=["I am a widget sibling"])

        if parent_is_template:
            widget = MyTemplate(child=child, class_="test-parent")
        else:
            widget = vue.Html(
                tag="div",
                children=[child],
                class_="test-parent",
            )
        display(widget)

    ipywidgets_runner(kernel_code, {"parent_is_template": parent_is_template})
    parent = page_session.locator(".test-parent")
    parent.wait_for()
    expect(parent.locator(":nth-child(1)")).to_contain_text("I am a widget sibling")


@pytest.mark.parametrize("parent_is_template", [True, False])
def test_vue_with_vue_template_child(
    ipywidgets_runner, page_session: playwright.sync_api.Page, parent_is_template
):
    def kernel_code():
        # this import is need so when this code executes in the kernel,
        # the class is imported
        from test_nested import MyTemplate
        import ipyvue as vue

        child = MyTemplate(class_="test-child", text="I am a child")

        if parent_is_template:
            widget = MyTemplate(
                child=child,
                class_="test-parent",
            )
        else:
            widget = vue.Html(
                tag="div",
                children=[child],
                class_="test-parent",
            )
        display(widget)

    ipywidgets_runner(kernel_code, {"parent_is_template": parent_is_template})
    parent = page_session.locator(".test-parent")
    parent.wait_for()
    expect(parent.locator(":nth-child(1) >> nth=0")).to_have_class("test-child")
    expect(parent.locator(".test-child >> :nth-child(1)")).to_contain_text(
        "I am a child"
    )


@pytest.mark.parametrize("parent_is_template", [True, False])
def test_vue_with_ipywidgets_child(
    ipywidgets_runner, page_session: playwright.sync_api.Page, parent_is_template
):
    def kernel_code():
        from test_nested import MyTemplate
        import ipyvue as vue
        import ipywidgets as widgets

        child = widgets.Label(value="I am a child")
        child.add_class("widget-child")

        if parent_is_template:
            widget = MyTemplate(
                child=child,
                class_="test-parent",
            )
        else:
            widget = vue.Html(
                tag="div",
                children=[child],
                class_="test-parent",
            )
        display(widget)

    ipywidgets_runner(kernel_code, {"parent_is_template": parent_is_template})
    parent = page_session.locator(".test-parent")
    parent.wait_for()
    # extra div is created by ipyvue
    expect(parent.locator(":nth-child(1) >> :nth-child(1)")).to_have_class(
        re.compile(".*widget-child.*")
    )
    expect(parent.locator(".widget-child")).to_contain_text("I am a child")


@pytest.mark.parametrize("parent_is_template", [True, False])
def test_vue_ipywidgets_vue(
    ipywidgets_runner, page_session: playwright.sync_api.Page, parent_is_template
):
    # tests an interrupted vue hierarchy
    def kernel_code():
        import ipywidgets as widgets
        import ipyvue as vue

        child = vue.Html(
            tag="div", children=["I am a widget sibling"], class_="test-child"
        )
        parent = widgets.VBox(children=[child])
        parent.add_class("ipywidgets-parent")
        grant_parent = vue.Html(
            tag="div",
            children=[child],
            class_="test-grandparent",
        )
        display(grant_parent)

    ipywidgets_runner(kernel_code, {"parent_is_template": parent_is_template})
    grand_parent = page_session.locator(".test-grandparent")
    grand_parent.wait_for()
    expect(grand_parent.locator(".test-child")).to_contain_text("I am a widget sibling")
