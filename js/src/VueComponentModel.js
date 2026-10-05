/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import {TemplateModel} from './Template';
import { VueTemplateModel } from './VueTemplateModel';
import { jupyterWidgetComponent } from './VueTemplateRenderer';
import {getAsyncComponent} from "./esmVueTemplate";
import { version } from './version';

const apps = new Set();
const appsWithBaseComponents = new WeakSet();
const registeredComponentsByApp = new WeakMap();
const modulePlugins = new Map();

export function addApp(app, widget_manager) {
    apps.add(app);

    if (!appsWithBaseComponents.has(app)) {
        app.component('jupyter-widget', jupyterWidgetComponent());
        appsWithBaseComponents.add(app);
    }
    modulePlugins.forEach(plugin => app.use(plugin));

    return syncComponentModels(app, widget_manager);
}

/* An ES module (see esm.py) whose default export is a vue plugin registers
 * its own components: we app.use it on every app, current and future.
 * app.use ignores repeated installs of the same plugin. Returns the names of
 * the components the plugin (re)registered. */
export function installModulePlugin(moduleName, plugin) {
    modulePlugins.set(moduleName, plugin);
    const componentNames = new Set();
    apps.forEach((app) => {
        const before = { ...app._context.components };
        app.use(plugin);
        Object.entries(app._context.components)
            .filter(([name, component]) => before[name] !== component)
            .forEach(([name]) => componentNames.add(name));
    });
    return [...componentNames];
}

function kebabCase(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function pascalCase(name) {
    return name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/* Vue resolves a tag in kebab or Pascal case, whichever way it was registered. */
export function usesTag(template, name) {
    const names = [...new Set([name, kebabCase(name), pascalCase(name)])].join('|');
    return typeof template === 'string' && new RegExp(`\\<(${names})[ />\n]`).test(template);
}

/* Re-renders every template that isAffected(model, templateModel) selects,
 * through the same change:template path as a template hot reload. */
export async function refreshTemplates(widget_manager, isAffected) {
    const models = await Promise.all(Object.values(widget_manager._models));
    new Set(models
        .filter(model => model instanceof VueTemplateModel)
        .map(model => [model, model.get('template') instanceof TemplateModel ? model.get('template') : model])
        .filter(([model, templateModel]) => isAffected(model, templateModel))
        .map(([, templateModel]) => templateModel))
        .forEach(templateModel => templateModel.trigger('change:template'));
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

                function find_usage(searchName) {
                    affectedComponents.push(searchName);
                    componentModels
                        .filter(model => usesTag(model.get('component'), searchName))
                        .forEach((model) => {
                            const cname = model.get('name');
                            if (!affectedComponents.includes(cname)) {
                                find_usage(cname);
                            }
                        });
                }

                find_usage(name);

                refreshTemplates(widget_manager, (model, templateModel) => affectedComponents
                    .some(cname => usesTag(templateModel.get('template'), cname)));
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
