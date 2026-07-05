/* eslint camelcase: off */
import {
    WidgetModel,
} from '@jupyter-widgets/base';

export
class TemplateModel extends WidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _model_name: 'TemplateModel',
                source_url: null,
                esm_module: null,
                esm_export: null,
            },
        };
    }
}

TemplateModel.serializers = {
    ...WidgetModel.serializers,
};
