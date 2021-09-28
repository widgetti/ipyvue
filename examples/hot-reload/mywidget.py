import ipyvue
import traitlets


ipyvue.register_component_from_file("my-component", "my_component.vue", __file__)
ipyvue.register_component_from_file(
    "my-sub-component", "my_sub_component.vue", __file__
)


class MyWidget(ipyvue.VueTemplate):
    template_file = (__file__, "my_widget_template.vue")

    some_data = traitlets.Dict().tag(sync=True)
