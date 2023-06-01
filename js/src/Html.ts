import { VueModel } from './VueModel';

export
class HtmlModel extends VueModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _model_name: 'HtmlModel',
                tag: null,
            },
        };
    }

    getVueTag() { // eslint-disable-line class-methods-use-this
        if (this.get('tag').toLowerCase().includes('script')) {
            return undefined;
        }
        return this.get('tag');
    }
}

HtmlModel.serializers = {
    ...VueModel.serializers,
};
