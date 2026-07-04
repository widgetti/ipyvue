import { WidgetModel } from '@jupyter-widgets/base';
import {
    invalidateModule,
    loadModuleFromCode,
    loadModuleFromUrl,
    provideModule,
    requestModule,
} from './esmVueTemplate';
import { installModulePlugin } from './VueComponentModel';

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
        this.load();
        this.on('change:code change:url', () => {
            invalidateModule(this.get('name'));
            this.load();
        });
    }

    async load() {
        const name = this.get('name');
        try {
            const dependencies = this.get('dependencies') || [];
            await Promise.all(dependencies.map(dep => requestModule(dep)));
            const url = this.get('url');
            const module = url
                ? await loadModuleFromUrl(url, name)
                : await loadModuleFromCode(this.get('code'), name);
            if (module.default && typeof module.default.install === 'function') {
                installModulePlugin(module.default);
            }
            provideModule(name, module);
        } catch (e) {
            console.error(`ipyvue: failed to load ES module "${name}"`, e);
            provideModule(name, e);
        }
    }
}

ModuleModel.serializers = {
    ...WidgetModel.serializers,
};
