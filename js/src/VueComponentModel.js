/* eslint camelcase: off */
import { DOMWidgetModel } from '@jupyter-widgets/base';
import {TemplateModel} from './Template';
import { VueTemplateModel } from './VueTemplateModel';
import { jupyterWidgetComponent } from './VueTemplateRenderer';
import {getAsyncComponent} from "./esmVueTemplate";
import { version } from './version';

const apps = new Set();
const widgetManagers = new Set();
const appsWithBaseComponents = new WeakSet();
const registeredComponentsByApp = new WeakMap();
const modulePlugins = new Map();

export function addApp(app, widget_manager) {
    apps.add(app);
    widgetManagers.add(widget_manager);

    if (!appsWithBaseComponents.has(app)) {
        app.component('jupyter-widget', jupyterWidgetComponent());
        appsWithBaseComponents.add(app);
    }
    modulePlugins.forEach(plugin => app.use(plugin));

    return syncComponentModels(app, widget_manager);
}

/* An ES module (see esm.py) whose default export is a vue plugin registers
 * its own components: we app.use it on every app, current and future.
 * app.use ignores repeated installs of the same plugin. */
export async function installModulePlugin(plugin, moduleName, widget_manager) {
    modulePlugins.set(moduleName, plugin);

    const componentNames = new Set();
    apps.forEach((app) => {
        const before = new Map(Object.entries(app._context.components || {}));
        app.use(plugin);
        Object.entries(app._context.components || {})
            .filter(([name, component]) => before.get(name) !== component)
            .forEach(([name]) => componentNames.add(name));
    });

    await triggerTemplatesForComponentNames(widget_manager, [...componentNames], {
        fallbackToAll: componentNames.size === 0,
    });
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function kebabCase(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

function pascalCase(value) {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function re(cname) {
    const names = [...new Set([cname, kebabCase(cname), pascalCase(cname)])]
        .map(escapeRegExp)
        .join('|');
    return new RegExp(`\\<(${names})(?=[ />\n])`, 'g');
}

function templateText(model) {
    if (model instanceof TemplateModel) {
        return model.get('template');
    }
    if (model instanceof VueTemplateModel && typeof model.get('template') === 'string') {
        return model.get('template');
    }
    return null;
}

function usesEsmModuleInComponents(model, moduleName) {
    return model instanceof VueTemplateModel
        && Object.values(model.get('components') || {})
            .some(spec => spec && spec.esm_module === moduleName);
}

function triggerTarget(model) {
    if (model instanceof VueTemplateModel && model.get('template') instanceof TemplateModel) {
        return model.get('template');
    }
    return model;
}

async function allModels(widget_manager) {
    const managers = widget_manager ? [widget_manager] : [...widgetManagers];
    if (!managers.length) {
        return [];
    }
    const modelValues = managers.flatMap((manager) => {
        if (manager._models instanceof Map) {
            return [...manager._models.values()];
        }
        return Object.values(manager._models);
    });
    const models = await Promise.all(modelValues);
    return [...new Set(models)];
}

function triggerTemplateChanges(models) {
    [...new Set(models)].forEach(model => model.trigger('change:template'));
}

export async function triggerTemplatesForComponentNames(widget_manager, componentNames, options = {}) {
    const models = await allModels(widget_manager);
    const matches = models
        .filter(model => templateText(model)
            && componentNames.some(cname => templateText(model).match(re(cname))));

    if (matches.length) {
        triggerTemplateChanges(matches);
        return;
    }

    if (options.fallbackToAll) {
        triggerTemplateChanges(models.filter(model => templateText(model)));
    }
}

export async function triggerTemplatesForModule(widget_manager, moduleName) {
    const models = await allModels(widget_manager);
    const matches = models
        .filter(model => model instanceof TemplateModel && model.get('esm_module') === moduleName)
        .concat(models
            .filter(model => usesEsmModuleInComponents(model, moduleName))
            .map(triggerTarget));

    triggerTemplateChanges(matches);
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
                    .filter(model => templateText(model)
                        && affectedComponents.some(cname => templateText(model).match(re(cname))));

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
