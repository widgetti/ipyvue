/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import Vue from 'vue';
import httpVueLoader from './httpVueLoader';
import {TemplateModel} from './Template';

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

        const [, { widget_manager }] = args;

        const name = this.get('name');
        Vue.component(name, httpVueLoader(this.get('component')));
        this.on('change:component', () => {
            Vue.component(name, httpVueLoader(this.get('component')));

            (async () => {
                const models = await Promise.all(Object.values(widget_manager._models));
                const componentModels = models
                    .filter(model => model instanceof VueComponentModel);

                const affectedComponents = [];

                function re(searchName) {
                    return new RegExp(`\\<${searchName}[ />\n]`, 'g');
                }

                function find_usage(searchName) {
                    affectedComponents.push(searchName);
                    componentModels
                        .filter(model => model.get('component').match(re(searchName)))
                        .forEach((model) => {
                            const cname = model.get('name');
                            if (!affectedComponents.includes(cname)) {
                                find_usage(cname);
                            }
                        });
                }

                find_usage(name);

                const affectedTemplateModels = models
                    .filter(model => model instanceof TemplateModel
                        && affectedComponents.some(cname => model.get('template').match(re(cname))));

                affectedTemplateModels.forEach(model => model.trigger('change:template'));
            })();
        });
    }
}

VueComponentModel.serializers = {
    ...DOMWidgetModel.serializers,
};
