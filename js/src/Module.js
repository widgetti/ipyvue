import { WidgetModel } from '@jupyter-widgets/base';
import Vue from 'vue';
import {
    invalidateModule,
    isStaleModuleLoad,
    loadModuleFromCode,
    loadModuleFromUrl,
    provideModule,
    requestModule,
} from './esmModule';
import {
    forceUpdateReplacedComponentInstances,
    triggerTemplateChangeForComponentTags,
    triggerTemplateChangeForEsmModule,
} from './templateRefresh';

const moduleGenerations = new Map();

function nextGeneration(name) {
    const generation = (moduleGenerations.get(name) || 0) + 1;
    moduleGenerations.set(name, generation);
    return generation;
}

function currentGeneration(name, generation) {
    return moduleGenerations.get(name) === generation;
}

function componentRegistryNames() {
    return Object.keys(Vue.options.components || {});
}

function componentRegistrySnapshot() {
    return { ...(Vue.options.components || {}) };
}

function findNewComponentNames(beforeComponents) {
    const components = Vue.options.components || {};
    return componentRegistryNames().filter(name => beforeComponents[name] !== components[name]);
}

function findReplacedComponents(beforeComponents) {
    const components = Vue.options.components || {};
    return componentRegistryNames()
        .filter(name => beforeComponents[name] && beforeComponents[name] !== components[name])
        .map(name => ({ name, component: beforeComponents[name] }));
}

/* Ships a precompiled ES module (see ipyvue.esm.define_module). A module
 * whose default export is a plain vue plugin ({ install }) registers its
 * own components: vue2 has a global registry, so Vue.use is all we need. */
export class ModuleModel extends WidgetModel {
    defaults() {
        return {
            ...super.defaults(),
            ...{
                _model_name: 'ModuleModel',
                name: '',
                code: '',
                url: null,
                dependencies: [],
            },
        };
    }

    initialize(attributes, options) {
        super.initialize(attributes, options);
        this.widgetManager = options.widget_manager;
        invalidateModule(this.get('name'));
        this.load();
        this.on('change:code change:url change:dependencies', () => {
            invalidateModule(this.get('name'));
            this.load();
        });
    }

    async load() {
        const name = this.get('name');
        const generation = nextGeneration(name);
        const isCurrent = () => currentGeneration(name, generation);
        try {
            const dependencies = this.get('dependencies') || [];
            await Promise.all(dependencies.map(dep => requestModule(dep)));
            if (!isCurrent()) {
                return;
            }
            const url = this.get('url');
            const module = url
                ? await loadModuleFromUrl(url, name, isCurrent)
                : await loadModuleFromCode(this.get('code'), name, isCurrent);
            if (!isCurrent()) {
                return;
            }
            let pluginComponentNames = null;
            let replacedComponents = null;
            if (module.default && typeof module.default.install === 'function') {
                const beforeComponents = componentRegistrySnapshot();
                Vue.use(module.default);
                pluginComponentNames = findNewComponentNames(beforeComponents);
                replacedComponents = findReplacedComponents(beforeComponents);
            }
            const replacesExistingModule = provideModule(name, module);
            if (pluginComponentNames) {
                try {
                    await triggerTemplateChangeForComponentTags(
                        this.widgetManager,
                        pluginComponentNames,
                        { fallbackAll: true },
                    );
                } catch (refreshError) {
                    console.warn(`ipyvue: could not refresh templates for ES module plugin "${name}"`, refreshError);
                }
            }
            if (replacedComponents) {
                try {
                    forceUpdateReplacedComponentInstances(replacedComponents);
                } catch (refreshError) {
                    console.warn(
                        `ipyvue: could not refresh replaced components for ES module plugin "${name}"`,
                        refreshError,
                    );
                }
            }
            if (replacesExistingModule) {
                try {
                    await triggerTemplateChangeForEsmModule(this.widgetManager, name);
                } catch (refreshError) {
                    console.warn(`ipyvue: could not refresh templates for ES module "${name}"`, refreshError);
                }
            }
        } catch (e) {
            if (!isCurrent() || isStaleModuleLoad(e)) {
                return;
            }
            console.error(`ipyvue: failed to load ES module "${name}"`, e);
            provideModule(name, e);
        }
    }
}

ModuleModel.serializers = {
    ...WidgetModel.serializers,
};
