/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';

export class ForceLoadModel extends DOMWidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _model_name: 'ForceLoadModel',
                _model_module: 'jupyter-vue',
                _model_module_version: '^0.0.1',
            },
        };
    }
}

ForceLoadModel.serializers = {
    ...DOMWidgetModel.serializers,
};
