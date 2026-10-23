/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import Vue from 'vue';
import httpVueLoader from './httpVueLoader';
import {TemplateModel} from './Template';
import { requestModule } from './esmModule';

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
                esm_module: null,
                esm_export: null,
            },
        };
    }

    constructor(...args) {
        super(...args);

        const [, { widget_manager }] = args;

        const name = this.get('name');
        const register = () => {
            if (this.get('esm_module')) {
                // an ES module export, as an async component like the source
                // components (httpVueLoader), so it mounts with the same timing
                const esmModule = this.get('esm_module');
                const esmExport = this.get('esm_export') || 'default';
                Vue.component(name, () => requestModule(esmModule).then((module) => {
                    if (module instanceof Error || !module[esmExport]) {
                        throw new Error(`ipyvue: module "${esmModule}" has no export "${esmExport}" for component "${name}"`);
                    }
                    return module[esmExport];
                }));
            } else {
                Vue.component(name, httpVueLoader(this.get('component')));
            }
        };
        register();
        // one event per update, also when hold_sync sends several of these fields
        this.on('change', () => {
            const changed = this.changedAttributes() || {};
            if (!['component', 'esm_module', 'esm_export'].some(key => key in changed)) {
                return;
            }
            register();

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
                        .filter(model => (model.get('component') || '').match(re(searchName)))
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
                        && model.get('template')
                        && affectedComponents.some(cname => model.get('template').match(re(cname))));

                affectedTemplateModels.forEach(model => model.trigger('change:template'));
            })();
        });
    }
}

VueComponentModel.serializers = {
    ...DOMWidgetModel.serializers,
};
