import { TemplateModel } from './Template';
import { VueTemplateModel } from './VueTemplateModel';
import Vue from 'vue';

const roots = new Set();

Vue.mixin({
    beforeCreate() {
        if (this.$root === this) {
            registerRoot(this);
        }
    },
    destroyed() {
        if (this.$root === this) {
            unregisterRoot(this);
        }
    },
});

export function registerRoot(vm) {
    roots.add(vm);
}

export function unregisterRoot(vm) {
    roots.delete(vm);
}

function forceUpdateTree(vm) {
    if (!vm || vm._isDestroyed) {
        return;
    }
    vm.$forceUpdate();
    Array.from(vm.$children || []).forEach(forceUpdateTree);
}

function forceUpdateRoots() {
    Array.from(roots).forEach(forceUpdateTree);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function kebabCase(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}

function pascalCase(value) {
    return value
        .split(/[-_]/g)
        .filter(part => part)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

export function componentTagRe(searchName) {
    return new RegExp(`\\<${escapeRegExp(searchName)}[ />\n]`, 'g');
}

function componentTagNames(componentNames) {
    return Array.from(new Set(
        componentNames
            .filter(name => name)
            .flatMap(name => [name, kebabCase(name), pascalCase(name)]),
    ));
}

async function getWidgetModels(widgetManager) {
    const results = await Promise.allSettled(Object.values(widgetManager._models));
    return results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
}

function templateText(model) {
    const template = model.get('template');
    return typeof template === 'string' ? template : null;
}

function triggerTemplateChange(models) {
    Array.from(new Set(models)).forEach(model => model.trigger('change:template'));
}

export async function triggerTemplateChangeForComponentTags(
    widgetManager,
    componentNames,
    { fallbackAll = false } = {},
) {
    const models = await getWidgetModels(widgetManager);
    const stringTemplateModels = models
        .filter(model => model instanceof TemplateModel || model instanceof VueTemplateModel)
        .filter(model => templateText(model));
    const esmTemplateModels = models
        .filter(model => model instanceof TemplateModel && model.get('esm_module'));
    const names = componentTagNames(componentNames);
    const affectedTemplateModels = names.length
        ? stringTemplateModels.filter(model => names.some(name => templateText(model).match(componentTagRe(name))))
        : [];
    triggerTemplateChange(
        [
            ...(names.length || !fallbackAll ? affectedTemplateModels : stringTemplateModels),
            ...esmTemplateModels,
        ],
    );
    forceUpdateRoots();
}

function templateTarget(model) {
    const template = model.get('template');
    return template instanceof TemplateModel ? template : model;
}

function hasEsmComponent(model, moduleName) {
    const components = model.get('components') || {};
    return Object.values(components).some(spec => spec && spec.esm_module === moduleName);
}

export async function triggerTemplateChangeForEsmModule(widgetManager, moduleName) {
    const models = await getWidgetModels(widgetManager);
    const affectedTemplateModels = models
        .filter(model => model instanceof TemplateModel && model.get('esm_module') === moduleName);
    const affectedVueTemplateModels = models
        .filter(model => model instanceof VueTemplateModel && hasEsmComponent(model, moduleName))
        .map(templateTarget);
    triggerTemplateChange([...affectedTemplateModels, ...affectedVueTemplateModels]);
}
