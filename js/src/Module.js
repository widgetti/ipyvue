import { WidgetModel } from '@jupyter-widgets/base';
import Vue from 'vue';
import {
    forceUpdateRoots,
    invalidateModule,
    isStaleModuleLoad,
    loadModuleFromCode,
    loadModuleFromUrl,
    provideModule,
    requestModule,
} from './esmModule';

const moduleGenerations = new Map();

function nextGeneration(name) {
    const generation = (moduleGenerations.get(name) || 0) + 1;
    moduleGenerations.set(name, generation);
    return generation;
}

function currentGeneration(name, generation) {
    return moduleGenerations.get(name) === generation;
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
        invalidateModule(this.get('name'));
        this.load();
        this.on('change:code change:url', () => {
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
            if (module.default && typeof module.default.install === 'function') {
                Vue.use(module.default);
                forceUpdateRoots();
            }
            provideModule(name, module);
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
