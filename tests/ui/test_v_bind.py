import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api

from IPython.display import display


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_v_bind_supports_vuetify3_activator_props(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    def kernel_code():
        import ipyvuetify as v

        tooltip = v.Tooltip(
            location="bottom",
            v_slots=[
                {
                    "name": "activator",
                    "variable": "tooltip",
                    "children": v.Btn(
                        v_bind="tooltip.props",
                        children=["Hover me"],
                        class_="v-bind-tooltip-button",
                    ),
                }
            ],
            children=["Tooltip via v_bind"],
        )

        display(tooltip)

    ipywidgets_runner(kernel_code)
    page_session.locator(".v-bind-tooltip-button").wait_for()
    page_session.locator(".v-bind-tooltip-button").hover()
    page_session.get_by_text("Tooltip via v_bind", exact=True).wait_for()
