/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import {TemplateModel} from './Template';
import { jupyterWidgetComponent } from './VueTemplateRenderer';
import {getAsyncComponent} from "./esmVueTemplate";
import { version } from './version';

const apps = new Set();
const appsWithBaseComponents = new WeakSet();
const registeredComponentsByApp = new WeakMap();

export function addApp(app, widget_manager) {
    apps.add(app);

    if (!appsWithBaseComponents.has(app)) {
        app.component('jupyter-widget', jupyterWidgetComponent());
        appsWithBaseComponents.add(app);
    }

    return syncComponentModels(app, widget_manager);
}

async function syncComponentModels(app, widget_manager) {
    const models = await Promise.all(Object.values(widget_manager._models));
    models
        .filter(model => model instanceof VueComponentModel)
        .forEach(model => registerComponentModel(app, model))
}

export function removeApp(app) {
    apps.delete(app);
}

function registerComponentModel(app, model) {
    let registeredComponents = registeredComponentsByApp.get(app);
    if (!registeredComponents) {
        registeredComponents = new Map();
        registeredComponentsByApp.set(app, registeredComponents);
    }

    if (registeredComponents.get(model.model_id) === model.compiledComponent) {
        return;
    }

    const name = model.get('name');
    app.component(name, model.compiledComponent);
    registeredComponents.set(model.model_id, model.compiledComponent);
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
                source_url: null,
            },
        };
    }

    constructor(...args) {
        super(...args);

        const [, { widget_manager }] = args;

        const name = this.get('name');

        const compileComponent = () => {
            this.compiledComponent = getAsyncComponent(this.get('component'), {}, {
                styleOwnerKey: `component-${this.model_id}`,
                sourceURL: this.get('source_url') || `ipyvue-component-${this.model_id}.vue`,
            });
        };

        compileComponent();

        apps.forEach(app => registerComponentModel(app, this));
        this.on('change:component', () => {
            compileComponent();
            apps.forEach(app => registerComponentModel(app, this));

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
        this.on('change:source_url', () => {
            compileComponent();
            apps.forEach(app => registerComponentModel(app, this));
        });
    }
}

VueComponentModel.serializers = {
    ...DOMWidgetModel.serializers,
};
