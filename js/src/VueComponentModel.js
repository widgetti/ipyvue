/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import Vue from 'vue';
import httpVueLoader from './httpVueLoader';

export class VueComponentModel extends DOMWidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _model_name: 'VueComponentModel',
                _model_module: 'jupyter-vue',
                _model_module_version: '^0.0.3',
                name: null,
                component: null,
            },
        };
    }

    constructor(...args) {
        super(...args);
        Vue.component(this.get('name'), httpVueLoader(this.get('component')));
        this.on('change:component', () => {
            Vue.component(this.get('name'), httpVueLoader(this.get('component')));
        });
    }
}

VueComponentModel.serializers = {
    ...DOMWidgetModel.serializers,
};
