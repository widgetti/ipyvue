from unittest.mock import MagicMock

from ipyvue import VueWidget


class TestVueWidget:

    CLASS = "tutu"
    CLASS_LIST = ["tutu", "toto"]

    def test_add_class(self):

        # empty widget
        test_widget = VueWidget()
        test_widget.class_list.add(*self.CLASS_LIST)
        assert test_widget.class_ == " ".join(self.CLASS_LIST)

        # with duplicate
        test_widget = VueWidget()
        test_widget.class_ = self.CLASS
        test_widget.class_list.add(*self.CLASS_LIST)
        assert test_widget.class_ == " ".join(self.CLASS_LIST)

    def test_remove_class(self):

        # existing
        test_widget = VueWidget()
        test_widget.class_ = " ".join(self.CLASS_LIST)
        test_widget.class_list.remove(self.CLASS)
        assert test_widget.class_ == self.CLASS_LIST[1]

        # not existing
        test_widget = VueWidget()
        test_widget.class_list.remove(*self.CLASS_LIST)
        assert test_widget.class_ == ""

    def test_toggle_class(self):

        test_widget = VueWidget()
        test_widget.class_ = self.CLASS
        test_widget.class_list.toggle(*self.CLASS_LIST)
        assert test_widget.class_ == self.CLASS_LIST[1]

    def test_replace_class(self):

        test_widget = VueWidget()
        test_widget.class_ = self.CLASS
        test_widget.class_list.replace(*self.CLASS_LIST)
        assert test_widget.class_ == self.CLASS_LIST[1]

    def test_hide(self):

        test_widget = VueWidget()
        test_widget.hide()
        assert "d-none" in test_widget.class_

    def test_show(self):

        test_widget = VueWidget()
        test_widget.class_list.add(self.CLASS, "d-none")
        test_widget.show()
        assert "d-none" not in test_widget.class_


def test_event_handling():
    event_handler = MagicMock()
    button = VueWidget()
    button.on_event("click.stop", event_handler)
    button.fire_event("click.stop", {"foo": "bar"})
    event_handler.assert_called_once_with(button, "click.stop", {"foo": "bar"})

    event_handler.reset_mock()
    button.click({"foo": "bar"})
    event_handler.assert_called_once_with(button, "click.stop", {"foo": "bar"})

    # test the code path as if it's coming from the frontend
    event_handler.reset_mock()
    button._handle_event(None, dict(event="click.stop", data={"foo": "bar"}), [])
    event_handler.assert_called_once_with(button, "click.stop", {"foo": "bar"})
