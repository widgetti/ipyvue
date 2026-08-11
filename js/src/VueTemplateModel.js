/* eslint camelcase: off */
import { DOMWidgetModel, unpack_models } from '@jupyter-widgets/base';
import { version } from './version';

export class VueTemplateModel extends DOMWidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _jupyter_vue: null,
                _model_name: 'VueTemplateModel',
                _view_name: 'VueView',
                _view_module: 'jupyter-vue',
                _model_module: 'jupyter-vue',
                _view_module_version: version,
                _model_module_version: version,
                template: null,
                css: null,
                methods: null,
                data: null,
                events: null,
                _component_instances: null,
            },
        };
    }
}

VueTemplateModel.serializers = {
    ...DOMWidgetModel.serializers,
    template: { deserialize: unpack_models },
    components: { deserialize: unpack_models },
    _component_instances: { deserialize: unpack_models },
};
