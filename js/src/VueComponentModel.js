/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import {TemplateModel} from './Template';
import {getAsyncComponent} from "./esmVueTemplate";
import { version } from './version';

const apps = new Set();

export function addApp(app, widget_manager) {
    apps.add(app);
    (async () => {
        const models = await Promise.all(Object.values(widget_manager._models));
        models
            .filter(model => model instanceof VueComponentModel)
            .forEach(model => {
                const name = model.get('name');
                app.component(name, model.compiledComponent);
            })
    })();
}

export function removeApp(app) {
    apps.delete(app);
}

export class VueComponentModel extends DOMWidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _model_name: 'VueComponentModel',
                _model_module: 'jupyter-vue',
                _model_module_version: version,
                name: null,
                component: null,
            },
        };
    }

    constructor(...args) {
        super(...args);

        const [, { widget_manager }] = args;

        const name = this.get('name');

        this.compiledComponent = getAsyncComponent(this.get('component'), {});

        apps.forEach(app => {
            app.component(name, this.compiledComponent);
        });
        this.on('change:component', () => {
            this.compiledComponent = getAsyncComponent(this.get('component'), {});
            apps.forEach(app => {
                app.component(name, this.compiledComponent);
            });

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
