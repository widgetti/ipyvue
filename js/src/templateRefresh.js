import Vue from 'vue';
import { TemplateModel } from './Template';
import { VueTemplateModel } from './VueTemplateModel';

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

function collectRefreshCids(vm) {
    let current = vm;
    while (current && !current._isDestroyed) {
        if (current.__ipyvueModelCid) {
            return new Set([current.__ipyvueModelCid]);
        }
        current = current.$parent;
    }
    return new Set();
}

function deleteChildCachePath(target, pathCids) {
    if (!target.childCache || !pathCids.size) {
        return;
    }
    pathCids.forEach((cid) => {
        // eslint-disable-next-line no-param-reassign
        delete target.childCache[cid];
    });
    if (target.childIds) {
        // eslint-disable-next-line no-param-reassign
        target.childIds = target.childIds.filter(cid => !pathCids.has(cid));
    }
}

function nearestVueInstance(element) {
    let current = element;
    while (current) {
        if (current.__vue__) {
            return current.__vue__;
        }
        current = current.parentNode;
    }
    return null;
}

function forceUpdateInstance(vm) {
    if (!vm || vm._isDestroyed) {
        return;
    }
    const targets = new Set([vm]);
    const renderContext = vm.$vnode && vm.$vnode.context;
    if (renderContext && !renderContext._isDestroyed) {
        targets.add(renderContext);
    }
    targets.forEach(forceUpdateSingleInstance);
}

function forceUpdateSingleInstance(vm) {
    if (!vm || vm._isDestroyed) {
        return;
    }
    deleteChildCachePath(vm, collectRefreshCids(vm));
    vm.$forceUpdate();
}

function vnodeChildren(vnode) {
    if (!vnode) {
        return [];
    }
    const children = Array.isArray(vnode.children) ? vnode.children : [];
    const componentChildren = vnode.componentOptions
        && Array.isArray(vnode.componentOptions.children)
        ? vnode.componentOptions.children
        : [];
    return [...children, ...componentChildren];
}

function vnodeContainsElementFromContext(vnode, element, context) {
    if (!vnode) {
        return false;
    }
    if (vnode.elm === element && vnode.context === context) {
        return true;
    }
    return vnodeChildren(vnode)
        .some(child => vnodeContainsElementFromContext(child, element, context));
}

function renderContextForElement(vm, element) {
    let current = vm;
    while (current && !current._isDestroyed) {
        if (vnodeContainsElementFromContext(current._vnode, element, current)) {
            return current;
        }
        current = current.$parent;
    }
    return null;
}

function forceUpdateComponentTags(names) {
    const instances = new Set();
    names.forEach((name) => {
        Array.from(document.getElementsByTagName(name)).forEach((element) => {
            const vm = nearestVueInstance(element);
            if (vm && !vm._isDestroyed) {
                instances.add(vm);
                const renderContext = renderContextForElement(vm, element);
                if (renderContext) {
                    instances.add(renderContext);
                }
            }
        });
    });
    instances.forEach(forceUpdateInstance);
}

function componentOptions(component) {
    return component && component.options ? component.options : component;
}

function componentCtorCandidates(vm) {
    const candidates = [vm.constructor];
    if (vm.$vnode && vm.$vnode.componentOptions && vm.$vnode.componentOptions.Ctor) {
        candidates.push(vm.$vnode.componentOptions.Ctor);
    }
    if (vm.$options) {
        candidates.push(vm.$options);
        if (vm.$options._Ctor) {
            if (typeof vm.$options._Ctor === 'function') {
                candidates.push(vm.$options._Ctor);
            } else {
                candidates.push(...Object.values(vm.$options._Ctor));
            }
        }
    }
    return candidates;
}

function componentMatches(candidate, component) {
    const options = componentOptions(component);
    return Boolean(
        candidate
        && component
        && (
            candidate === component
            || candidate === options
            || componentOptions(candidate) === options
        ),
    );
}

function vmMatchesComponent(vm, component) {
    return componentCtorCandidates(vm)
        .some(candidate => componentMatches(candidate, component));
}

function walkInstanceTree(vm, visit) {
    if (!vm || vm._isDestroyed) {
        return;
    }
    visit(vm);
    Array.from(vm.$children || [])
        .forEach(child => walkInstanceTree(child, visit));
}

export function forceUpdateReplacedComponentInstances(replacedComponents) {
    if (!replacedComponents || !replacedComponents.length) {
        return;
    }
    const contexts = new Set();
    Array.from(roots).forEach((root) => {
        walkInstanceTree(root, (vm) => {
            if (replacedComponents.some(({ component }) => vmMatchesComponent(vm, component))) {
                const context = vm.$vnode && vm.$vnode.context;
                if (context && !context._isDestroyed) {
                    contexts.add(context);
                }
            }
        });
    });
    contexts.forEach(forceUpdateSingleInstance);
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
        ? stringTemplateModels
            .filter(model => names.some(name => templateText(model).match(componentTagRe(name))))
        : [];
    triggerTemplateChange(
        [
            ...(names.length || !fallbackAll ? affectedTemplateModels : stringTemplateModels),
            ...esmTemplateModels,
        ],
    );
    if (names.length) {
        forceUpdateComponentTags(names);
    } else if (fallbackAll) {
        forceUpdateRoots();
    }
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
