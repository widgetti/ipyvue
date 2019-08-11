/* eslint camelcase: off */
import { DOMWidgetModel, unpack_models } from '@jupyter-widgets/base';

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
                _view_module_version: '^0.0.3',
                _model_module_version: '^0.0.3',
                template: null,
                events: null,
            },
        };
    }
}

VueTemplateModel.serializers = {
    ...DOMWidgetModel.serializers,
    components: { deserialize: unpack_models },
};
