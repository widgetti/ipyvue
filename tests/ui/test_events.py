import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)
import ipyvue as vue
import playwright.sync_api
from IPython.display import display
from unittest.mock import MagicMock


def test_widget_button(solara_test, page_session: playwright.sync_api.Page):
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
