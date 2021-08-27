import unittest

from ipyvue import VueWidget


class TestVueWidget(unittest.TestCase):

    CLASS = "tutu"
    CLASS_LIST = ["tutu", "toto"]

    def test_add_class(self):

        # empty widget
        test_widget = VueWidget()
        test_widget.class_list.add(*self.CLASS_LIST)
        self.assertEqual(test_widget.class_, " ".join(self.CLASS_LIST))

        # with duplicate
        test_widget = VueWidget()
        test_widget.class_ = self.CLASS
        test_widget.class_list.add(*self.CLASS_LIST)
        self.assertEqual(test_widget.class_, " ".join(self.CLASS_LIST))

        return

    def test_remove_class(self):

        # existing
        test_widget = VueWidget()
        test_widget.class_ = ' '.join(self.CLASS_LIST)
        test_widget.class_list.remove(self.CLASS)
        self.assertEqual(test_widget.class_, self.CLASS_LIST[1])

        # not existing
        test_widget = VueWidget()
        test_widget.class_list.remove(*self.CLASS_LIST)
        self.assertEqual(test_widget.class_, "")

        return

    def test_toggle_class(self):

        test_widget = VueWidget()
        test_widget.class_ = self.CLASS
        test_widget.class_list.toggle(*self.CLASS_LIST)
        self.assertEqual(test_widget.class_, self.CLASS_LIST[1])

        return

    def test_replace_class(self):

        test_widget = VueWidget()
        test_widget.class_ = self.CLASS
        test_widget.class_list.replace(*self.CLASS_LIST)
        self.assertEqual(test_widget.class_, self.CLASS_LIST[1])

        return

    def test_hide(self):

        test_widget = VueWidget()
        test_widget.hide()
        self.assertIn("d-none", test_widget.class_)

        return

    def test_show(self):

        test_widget = VueWidget()
        test_widget.class_list.add(self.CLASS, "d-none")
        test_widget.show()
        self.assertNotIn("d-none", test_widget.class_)

        return