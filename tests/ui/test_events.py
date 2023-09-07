import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)
import ipyvue as vue
import playwright.sync_api
from IPython.display import display
from unittest.mock import MagicMock


def test_event_basics(solara_test, page_session: playwright.sync_api.Page):
    inner = vue.Html(tag="div", children=["Click Me!"])
    outer = vue.Html(tag="dev", children=[inner])
    mock_outer = MagicMock()

    def on_click_inner(*ignore):
        inner.children = ["Clicked"]

    # should stop propagation
    inner.on_event("click.stop", on_click_inner)
    outer.on_event("click", mock_outer)

    display(outer)
    inner_sel = page_session.locator("text=Click Me!")
    inner_sel.wait_for()
    inner_sel.click()
    page_session.locator("text=Clicked").wait_for()
    mock_outer.assert_not_called()

    # reset
    inner.children = ["Click Me!"]
    # Now we should NOT stop propagation
    inner.on_event("click", on_click_inner)
    inner_sel.wait_for()
    inner_sel.click()
    page_session.locator("text=Clicked").wait_for()
    mock_outer.assert_called_once()


def test_mouse_event(solara_test, page_session: playwright.sync_api.Page):
    div = vue.Html(tag="div", children=["Click Me!"])
    last_event_data = None

    def on_click(widget, event, data):
        nonlocal last_event_data
        last_event_data = data
        div.children = ["Clicked"]

    div.on_event("click", on_click)
    display(div)

    # click in the div
    box = page_session.locator("text=Click Me!").bounding_box()
    assert box is not None
    page_session.mouse.click(box["x"], box["y"])

    page_session.locator("text=Clicked").wait_for()
    assert last_event_data is not None
    assert last_event_data["x"] == box["x"]
    assert last_event_data["y"] == box["y"]
