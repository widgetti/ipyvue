/* eslint camelcase: off */
import {
    DOMWidgetModel, unpack_models,
} from '@jupyter-widgets/base';

export class VueModel extends DOMWidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _jupyter_vue: null,
                _model_name: 'VueModel',
                _view_name: 'VueView',
                _view_module: 'jupyter-vue',
                _model_module: 'jupyter-vue',
                _view_module_version: '3.0.0-dev.0',
                _model_module_version: '3.0.0-dev.0',
                _metadata: null,
                children: undefined,
                slot: null,
                _events: null,
                v_model: '!!disabled!!',
                style_: null,
                class_: null,
                attributes: null,
                v_slots: null,
                v_on: null,
            },
        };
    }
}

VueModel.serializers = {
    ...DOMWidgetModel.serializers,
    children: { deserialize: unpack_models },
    v_slots: { deserialize: unpack_models },
};
