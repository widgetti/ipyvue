/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import { version } from './version';

export class ForceLoadModel extends DOMWidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _model_name: 'ForceLoadModel',
                _model_module: 'jupyter-vue',
                _model_module_version: version,
            },
        };
    }
}

ForceLoadModel.serializers = {
    ...DOMWidgetModel.serializers,
};
