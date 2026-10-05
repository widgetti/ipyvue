import { WidgetModel } from '@jupyter-widgets/base';
import Vue from 'vue';
import {
    invalidateModule,
    loadModuleFromCode,
    loadModuleFromUrl,
    provideModule,
    requestModule,
} from './esmModule';
import { rerenderTemplates } from './VueTemplateRenderer';

const moduleGenerations = new Map();

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
        this.on('change:code change:url change:dependencies', () => {
            invalidateModule(this.get('name'));
            this.load();
        });
    }

    async load() {
        const name = this.get('name');
        /* a newer load of the same name (a reload, or a second widget for
         * it) wins: this one must not provide its module anymore */
        const generation = (moduleGenerations.get(name) || 0) + 1;
        moduleGenerations.set(name, generation);
        const isCurrent = () => moduleGenerations.get(name) === generation;
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
                /* templates that rendered one of its tags before it was
                 * registered resolve it on their next render */
                rerenderTemplates();
            }
            provideModule(name, module);
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
