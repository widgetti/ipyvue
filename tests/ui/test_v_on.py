import pytest
import sys

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import playwright.sync_api


@pytest.mark.parametrize("ipywidgets_runner", ["solara"], indirect=True)
def test_v_on_supports_nested_slot_scope_paths_and_vuetify3_props_fallback(
    ipywidgets_runner,
    page_session: playwright.sync_api.Page,
):
    ipywidgets_runner(lambda: None)
    page_session.wait_for_function("window.requirejs !== undefined")

    resolved = page_session.evaluate(
        """() => new Promise((resolve, reject) => {
            requirejs(["jupyter-vue"], (jupyterVue) => {
                try {
                    const nested = jupyterVue.getScope("scopeData.nested", {
                        scopeData: {
                            nested: {
                                onClick: "nested-click",
                                onMouseenter: "nested-hover",
                            },
                        },
                    });
                    const tooltip = jupyterVue.getScope("tooltip.on", {
                        tooltip: {
                            props: {
                                onMouseenter: "tooltip-hover",
                                id: "ignored-non-event-prop",
                            },
                        },
                    });

                    resolve({
                        nestedKeys: Object.keys(nested || {}).sort(),
                        nestedClick: nested && nested.onClick,
                        tooltipKeys: Object.keys(tooltip || {}).sort(),
                        tooltipHover: tooltip && tooltip.onMouseenter,
                        tooltipId: tooltip && tooltip.id,
                    });
                } catch (error) {
                    reject(error);
                }
            }, reject);
        })"""
    )

    assert resolved == {
        "nestedKeys": ["onClick", "onMouseenter"],
        "nestedClick": "nested-click",
        "tooltipKeys": ["onMouseenter"],
        "tooltipHover": "tooltip-hover",
        "tooltipId": None,
    }
