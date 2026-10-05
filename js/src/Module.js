import { WidgetModel } from '@jupyter-widgets/base';
import {
    invalidateModule,
    loadModule,
    provideModule,
    requestModule,
} from './esmVueTemplate';
import { installModulePlugin, refreshTemplates, usesTag } from './VueComponentModel';
import { VueModel } from './VueModel';

/* Per module name, so a slow load of old code cannot overwrite newer code. */
const moduleGenerations = new Map();

function usesModule(model, templateModel, name) {
    return templateModel.get('esm_module') === name
        || Object.values(model.get('components') || {}).some(spec => spec && spec.esm_module === name);
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
        this.load();
        this.on('change:code change:url change:dependencies', () => this.load());
    }

    async load() {
        const name = this.get('name');
        const generation = (moduleGenerations.get(name) || 0) + 1;
        moduleGenerations.set(name, generation);
        const isCurrent = () => moduleGenerations.get(name) === generation;
        invalidateModule(name);
        try {
            const dependencies = this.get('dependencies') || [];
            await Promise.all(dependencies.map(dep => requestModule(dep)));
            if (!isCurrent()) {
                return;
            }
            const module = await loadModule(name, this.get('url'), this.get('code'), isCurrent);
            if (!module) {
                return;
            }
            const isPlugin = module.default && typeof module.default.install === 'function';
            const tags = isPlugin ? installModulePlugin(name, module.default) : [];
            const replaced = provideModule(name, module);
            if (replaced || isPlugin) {
                /* Mounted templates keep the component they resolved; re-render
                 * the ones that use this module or may use the plugin's tags.
                 * A precompiled template resolves tags in its render function,
                 * so any ESM template may use them. */
                refreshTemplates(this.widget_manager, (model, templateModel) => (
                    (replaced && usesModule(model, templateModel, name))
                    || (isPlugin && templateModel.get('esm_module'))
                    || tags.some(tag => [templateModel.get('template'), ...Object.values(model.get('components') || {})]
                        .some(template => usesTag(template, tag)))
                ));
            }
            if (tags.length) {
                /* VueWidgets (e.g. Html(tag=...)) rendered before the plugin loaded */
                Promise.all(Object.values(this.widget_manager._models)).then(models => models
                    .filter(model => model instanceof VueModel && tags.some(tag => usesTag(`<${model.get('tag')}>`, tag)))
                    .forEach(model => model.trigger('change:tag')));
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
