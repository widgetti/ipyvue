import { WidgetModel } from '@jupyter-widgets/base';
import {
    invalidateModule,
    loadModuleFromCode,
    loadModuleFromUrl,
    provideModule,
    requestModule,
} from './esmVueTemplate';
import {
    installModulePlugin,
    refreshAfterModulePluginInstall,
    triggerTemplatesForModule,
} from './VueComponentModel';

const moduleGenerations = new Map();

function nextModuleGeneration(name) {
    const generation = (moduleGenerations.get(name) || 0) + 1;
    moduleGenerations.set(name, generation);
    return generation;
}

function isLatestModuleGeneration(name, generation) {
    return moduleGenerations.get(name) === generation;
}

/* Ships a precompiled ES module (see ipyvue.esm.define_module). The code is
 * imported via es-module-shims and provided to the named-module registry,
 * where getEsmAsyncComponent consumers await it. */
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
        this.widget_manager = options && options.widget_manager;
        invalidateModule(this.get('name'));
        this.load();
        this.on('change:code change:url change:dependencies', () => {
            invalidateModule(this.get('name'));
            this.load();
        });
    }

    async load() {
        const name = this.get('name');
        const generation = nextModuleGeneration(name);
        const isCurrent = () => isLatestModuleGeneration(name, generation);
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
            if (!isCurrent() || module === undefined) {
                return;
            }
            let pluginComponentNames = null;
            const isPlugin = module.default && typeof module.default.install === 'function';
            if (isPlugin) {
                pluginComponentNames = await installModulePlugin(module.default, name);
            }
            if (!isCurrent()) {
                return;
            }
            const replacedModule = provideModule(name, module);
            try {
                if (isPlugin) {
                    await refreshAfterModulePluginInstall(this.widget_manager, pluginComponentNames);
                }
                if (replacedModule) {
                    await triggerTemplatesForModule(this.widget_manager, name);
                }
            } catch (e) {
                console.warn(`ipyvue: failed to refresh ES module "${name}"`, e);
            }
        } catch (e) {
            if (!isCurrent()) {
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
