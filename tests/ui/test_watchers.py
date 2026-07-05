import pytest
import sys
from playwright.sync_api import Page
from traitlets import Callable, Int, Unicode, default
from IPython.display import display

if sys.version_info < (3, 7):
    pytest.skip("requires python3.7 or higher", allow_module_level=True)

import ipyvue as vue


class WatcherTemplateTraitlet(vue.VueTemplate):
    number = Int(0).tag(sync=True)
    callback = Callable()
    text = Unicode("Click Me ").tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div @click="number += 1">{{text + number}}</div>
        </template>
        <script>
        export default {
            watch: {
                number: function(value) {
                    callback();
                }
            }
        }
        </script>
        """

    def vue_callback(self):
        self.callback()


# We test that the watcher is activated when a var from python is changed
def test_watcher_traitlet(solara_test, page_session: Page):
    def callback():
        widget.text = "Clicked "

    widget = WatcherTemplateTraitlet(callback=callback)

    display(widget)

    widget = page_session.locator("text=Click Me 0")
    widget.click()
    widget = page_session.locator("text=Clicked 1")


class WatcherTemplateVue(vue.VueTemplate):
    callback = Callable()
    text = Unicode("Click Me ").tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div @click="number += 1">{{text + number}}</div>
        </template>
        <script>
        export default {
            watch: {
                number: function(value) {
                    callback();
                }
            },
            data(){
                return {
                    number: 0
                }
            }
        }
        </script>
        """

    def vue_callback(self):
        self.callback()


# We test that watch works for a purely Vue variable
def test_watcher_vue(solara_test, page_session: Page):
    def callback():
        widget.text = "Clicked "

    widget = WatcherTemplateVue(callback=callback)

    display(widget)

    widget = page_session.locator("text=Click Me 0")
    widget.click()
    widget = page_session.locator("text=Clicked 1")


class WatcherOldValueTemplate(vue.VueTemplate):
    number = Int(0).tag(sync=True)
    text = Unicode("old: ").tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div @click="number += 1">{{text + number}}</div>
        </template>
        <script>
        export default {
            watch: {
                number: function(value, oldValue) {
                    this.text = "old: " + oldValue + " new: ";
                }
            }
        }
        </script>
        """


# Watchers follow the vue API: they also receive the previous value
def test_watcher_old_value(solara_test, page_session: Page):
    widget = WatcherOldValueTemplate()

    display(widget)

    element = page_session.locator("text=old: 0")
    element.click()
    page_session.locator("text=old: 0 new: 1").wait_for()


class WatcherObjectFormTemplate(vue.VueTemplate):
    number = Int(0).tag(sync=True)
    text = Unicode("start").tag(sync=True)

    @default("template")
    def _default_vue_template(self):
        return """
        <template>
            <div>{{text}}</div>
        </template>
        <script>
        export default {
            watch: {
                number: {
                    handler: function(value, oldValue) {
                        this.text = "object saw " + oldValue + " -> " + value;
                    },
                    deep: true,
                }
            }
        }
        </script>
        """


# Object-form watchers ({handler, deep}) are valid vue and must not crash
# when a synced trait changes from python
def test_watcher_object_form(solara_test, page_session: Page):
    widget = WatcherObjectFormTemplate()

    display(widget)

    page_session.locator("text=start").wait_for()
    widget.number = 3
    page_session.locator("text=object saw 0 -> 3").wait_for()
