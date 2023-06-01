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
            },
        };
    }
}

TemplateModel.serializers = {
    ...WidgetModel.serializers,
};
