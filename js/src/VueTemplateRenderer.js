import { WidgetModel } from '@jupyter-widgets/base';
import uuid4 from 'uuid/v4';
import _ from 'lodash';
import Vue from 'vue';
import { parseComponent } from '@mariobuikhuizen/vue-compiler-addon';
import { createObjectForNestedModel, eventToObject, vueRender } from './VueRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import httpVueLoader from './httpVueLoader';
import { getEsmComponent, getModuleExport } from './esmModule';
import { TemplateModel } from './Template';

function normalizeScopeId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getScopeId(model, cssId) {
    const base = cssId || model.cid;
    return `data-s-${normalizeScopeId(base)}`;
}

function applyScopeId(vm, scopeId) {
    if (!scopeId || !vm || !vm.$el) {
        return;
    }
    vm.$el.setAttribute(scopeId, '');
}

function scopeStyleElement(styleElt, scopeId) {
    const scopeSelector = `[${scopeId}]`;

    function scopeRules(rules, insertRule, deleteRule) {
        for (let i = 0; i < rules.length; ++i) {
            const rule = rules[i];
            if (rule.type === 1 && rule.selectorText) {
                const scopedSelectors = [];
                rule.selectorText.split(/\s*,\s*/).forEach((sel) => {
                    scopedSelectors.push(`${scopeSelector} ${sel}`);
                    const segments = sel.match(/([^ :]+)(.+)?/);
                    if (segments) {
                        scopedSelectors.push(`${segments[1]}${scopeSelector}${segments[2] || ''}`);
                    }
                });
                const scopedRule = scopedSelectors.join(',') + rule.cssText.substring(rule.selectorText.length);
                deleteRule(i);
                insertRule(scopedRule, i);
            }
            if (rule.cssRules && rule.cssRules.length && rule.insertRule && rule.deleteRule) {
                scopeRules(rule.cssRules, rule.insertRule.bind(rule), rule.deleteRule.bind(rule));
            }
        }
    }

    function process() {
        const sheet = styleElt.sheet;
        if (!sheet) {
            return;
        }
        scopeRules(sheet.cssRules, sheet.insertRule.bind(sheet), sheet.deleteRule.bind(sheet));
    }

    try {
        process();
    } catch (ex) {
        if (typeof DOMException !== 'undefined' && ex instanceof DOMException && ex.code === DOMException.INVALID_ACCESS_ERR) {
            styleElt.sheet.disabled = true;
            styleElt.addEventListener('load', function onStyleLoaded() {
                styleElt.removeEventListener('load', onStyleLoaded);
                setTimeout(() => {
                    process();
                    styleElt.sheet.disabled = false;
                });
            });
            return;
        }
        throw ex;
    }
}

/* Mounted template and widget components: a module plugin can register a
 * tag after one of them rendered it as an unknown element, and vue2 only
 * resolves tags on render. */
const tagConsumers = new Set();

export const rerenderedByPlugins = {
    created() {
        tagConsumers.add(this);
    },
    destroyed() {
        tagConsumers.delete(this);
    },
};

export function rerenderTemplates() {
    tagConsumers.forEach(vm => vm.$forceUpdate());
}

export function vueTemplateRender(createElement, model, parentView) {
    const component = createComponentObject(model, parentView);
    /* a functional template holder makes its parent read the module: wrap
     * it, so a parent that caches its child vnodes cannot hide a reload */
    return createElement(component.functional ? { render: h => h(component) } : component);
}

function createComponentObject(model, parentView) {
    if (model instanceof VueModel) {
        return {
            render(createElement) {
                return vueRender(createElement, model, parentView, {});
            },
        };
    }
    if (!(model instanceof VueTemplateModel)) {
        return createObjectForNestedModel(model, parentView);
    }

    const isTemplateModel = model.get('template') instanceof TemplateModel;
    const templateModel = isTemplateModel ? model.get('template') : model;
    if (isTemplateModel && templateModel.get('esm_module')) {
        return createTemplateHolder(model, templateModel, parentView);
    }
    const template = templateModel.get('template');
    const sourceCodeFile = `VUE_TEMPLATE_SCRIPT_${model.cid}`;
    const vuefile = readVueFile(template, sourceCodeFile);

    const css = model.get('css') || (vuefile.STYLE && vuefile.STYLE.content);
    const cssId = (vuefile.STYLE && vuefile.STYLE.id);
    const scopedFromTemplate = (vuefile.STYLE && vuefile.STYLE.scoped);
    const scoped = model.get('scoped');
    const scopedCssSupport = model.get('scoped_css_support');
    // If scoped trait is explicitly set, use it (for css trait with scoped=True/False)
    // If scoped is not set (None), only honor <style scoped> from template if scoped_css_support is enabled
    const useScoped = scoped !== null && scoped !== undefined
        ? scoped
        : (scopedCssSupport && scopedFromTemplate);
    const scopeId = useScoped && css ? getScopeId(model, cssId) : null;

    if (css) {
        if (cssId) {
            const prefixedCssId = `ipyvue-${cssId}`;
            let style = document.getElementById(prefixedCssId);
            if (!style) {
                style = document.createElement('style');
                style.id = prefixedCssId;
                document.head.appendChild(style);
            }
            if (scopeId) {
                if (style.innerHTML !== css || style.getAttribute('data-ipyvue-scope') !== scopeId) {
                    style.innerHTML = css;
                    scopeStyleElement(style, scopeId);
                    style.setAttribute('data-ipyvue-scope', scopeId);
                }
            } else {
                // Reset innerHTML if CSS changed or if transitioning from scoped to unscoped
                // (need to reset to remove the scoped CSS rule transformations)
                const wasScoped = style.getAttribute('data-ipyvue-scope');
                if (style.innerHTML !== css || wasScoped) {
                    style.innerHTML = css;
                    if (wasScoped) {
                        style.removeAttribute('data-ipyvue-scope');
                    }
                }
            }
        } else {
            const style = document.createElement('style');
            style.id = model.cid;
            style.innerHTML = css;
            document.head.appendChild(style);
            if (scopeId) {
                scopeStyleElement(style, scopeId);
                style.setAttribute('data-ipyvue-scope', scopeId);
            }
            parentView.once('remove', () => {
                document.head.removeChild(style);
            });
        }
    }

    // eslint-disable-next-line no-new-func
    const methods = model.get('methods') ? Function(`return ${model.get('methods').replace('\n', ' ')}`)() : {};
    // eslint-disable-next-line no-new-func
    const data = model.get('data') ? Function(`return ${model.get('data').replace('\n', ' ')}`)() : {};

    function callVueFn(name, this_) {
        if (vuefile.SCRIPT && vuefile.SCRIPT[name]) {
            vuefile.SCRIPT[name].bind(this_)();
        }
    }

    return {
        inject: ['viewCtx'],
        mixins: [rerenderedByPlugins],
        data() {
            // data that is only used in the template, and not synced with the backend/model
            const dataTemplate = (vuefile.SCRIPT && vuefile.SCRIPT.data && vuefile.SCRIPT.data()) || {};
            return { ...data, ...dataTemplate, ...createDataMapping(model) };
        },
        beforeCreate() {
            callVueFn('beforeCreate', this);
        },
        created() {
            this.__onTemplateChange = () => {
                this.$root.$forceUpdate();
            };
            /* a new esm_module re-renders through the ES module holder */
            templateModel.on('change:template change:esm_module', this.__onTemplateChange);
            addModelListeners(model, this);
            callVueFn('created', this);
        },
        watch: createWatches(model, parentView, vuefile.SCRIPT && vuefile.SCRIPT.watch),
        methods: {
            ...vuefile.SCRIPT && vuefile.SCRIPT.methods,
            ...methods,
            ...createMethods(model, parentView),
        },
        components: createComponents(model, parentView),
        computed: { ...vuefile.SCRIPT && vuefile.SCRIPT.computed, ...aliasRefProps(model) },
        template: vuefile.TEMPLATE === undefined && vuefile.SCRIPT === undefined && vuefile.STYLE === undefined
            ? template
            : vuefile.TEMPLATE,
        beforeMount() {
            applyScopeId(this, scopeId);
            callVueFn('beforeMount', this);
        },
        mounted() {
            applyScopeId(this, scopeId);
            callVueFn('mounted', this);
        },
        beforeUpdate() {
            callVueFn('beforeUpdate', this);
        },
        updated() {
            applyScopeId(this, scopeId);
            callVueFn('updated', this);
        },
        beforeDestroy() {
            templateModel.off('change:template change:esm_module', this.__onTemplateChange);
            model.off(null, null, this);
            callVueFn('beforeDestroy', this);
        },
        destroyed() {
            callVueFn('destroyed', this);
        },
    };
}

/* A Template's precompiled ES module export (see ipyvue.esm.define_module
 * and Template.esm_module), picked per render. Functional, so refs, events
 * and slots reach the export; the parent render reads the module and the
 * model's version, so it renders the new implementation after a change. */
function createTemplateHolder(model, templateModel, parentView) {
    let esm = {};
    return {
        functional: true,
        render(h, { data, children }) {
            const version = implementationVersion(model, templateModel);
            const moduleName = templateModel.get('esm_module');
            if (!moduleName) {
                /* esm_module was unset: render the current compiled template */
                return h(createComponentObject(model, parentView), data, children);
            }
            const component = getModuleExport(moduleName, templateModel.get('esm_export'));
            if (!component) {
                return h();
            }
            if (esm.component !== component || esm.version !== version) {
                const object = createEsmTemplateObject(model, component, parentView);
                esm = { component, version, object };
            }
            return h(esm.object, data, children);
        },
    };
}

/* One reactive version per model, bumped when its ES module implementation
 * inputs change; per model, so listeners do not pile up per render. */
const implementationVersions = new WeakMap();

function implementationVersion(model, templateModel) {
    if (!implementationVersions.has(model)) {
        const cell = Vue.observable({ version: 0 });
        const bump = () => {
            cell.version += 1;
        };
        model.listenTo(templateModel, 'change:esm_module change:esm_export', bump);
        model.on('change:components change:events', bump);
        implementationVersions.set(model, cell);
    }
    return implementationVersions.get(model).version;
}

/* The export's options ride as mixins[0] under the model mixin: vue merges
 * mixins in order, so model traits override the script's data()
 * placeholders and injected event handlers override method stubs - the same
 * precedence as the in-browser compiled path. */
function createEsmTemplateObject(model, component, parentView) {
    /* template-form components get their state as data (for the two-way
     * model sync); vue2 lets a props declaration (e.g. written for type
     * checkers) shadow that data, so ignore it like the compiled-template
     * path does */
    const { props, ...withoutProps } = component;
    const modelMixin = {
        inject: ['viewCtx'],
        mixins: [rerenderedByPlugins],
        data() {
            return createDataMapping(model);
        },
        created() {
            addModelListeners(model, this);
        },
        beforeDestroy() {
            model.off(null, null, this);
        },
        watch: createWatches(model, parentView, null),
        methods: createMethods(model, parentView),
        components: createComponents(model, parentView),
        computed: aliasRefProps(model),
    };
    return { mixins: [withoutProps, modelMixin] };
}

function createComponents(model, parentView) {
    const componentEntries = Object.entries(model.get('components') || {});
    const isEsm = v => v && v.esm_module;
    const instanceComponents = componentEntries.filter(([, v]) => v instanceof WidgetModel);
    const esmComponents = componentEntries.filter(([, v]) => isEsm(v));
    const classComponents = componentEntries.filter(([, v]) => !(v instanceof WidgetModel) && !(typeof v === 'string') && !isEsm(v));
    const fullVueComponents = componentEntries.filter(([, v]) => typeof v === 'string');
    return {
        ...createInstanceComponents(instanceComponents, parentView),
        ...createClassComponents(classComponents, model, parentView),
        ...createFullVueComponents(fullVueComponents),
        ...createEsmComponents(esmComponents),
    };
}

function createDataMapping(model) {
    return model.keys()
        .filter(prop => !prop.startsWith('_')
            && !['events', 'template', 'components', 'layout', 'css', 'scoped', 'scoped_css_support', 'data', 'methods'].includes(prop))
        .reduce((result, prop) => {
            result[prop] = _.cloneDeep(model.get(prop)); // eslint-disable-line no-param-reassign
            return result;
        }, {});
}

function addModelListeners(model, vueModel) {
    model.keys()
        .filter(prop => !prop.startsWith('_')
            && !['v_model', 'components', 'layout', 'css', 'scoped', 'scoped_css_support', 'data', 'methods'].includes(prop))
        // eslint-disable-next-line no-param-reassign
        .forEach(prop => model.on(`change:${prop}`, () => {
            if (_.isEqual(model.get(prop), vueModel[prop])) {
                return;
            }
            vueModel[prop] = _.cloneDeep(model.get(prop));
        }, vueModel));
    model.on('msg:custom', (content, buffers) => {
        if (!content['method']) {
            return;
        }
        const jupyter_method = 'jupyter_' + content['method'];
        if (!vueModel[jupyter_method]) {
            return;
        }
        let args_ = content['args']
        if ( args_ == null) {
            args_ = []
        }
        vueModel[jupyter_method](...args_, buffers);
    }, vueModel);
}

/* vue allows function, {handler, ...}, method-name string and array watchers */
function callTemplateWatcher(vm, watcher, value, oldValue) {
    [].concat(watcher).forEach((entry) => {
        const handler = typeof entry === 'object' ? entry.handler : entry;
        (typeof handler === 'string' ? vm[handler] : handler).call(vm, value, oldValue);
    });
}

function watchesImmediately(watcher) {
    return [].concat(watcher || []).some(entry => entry && entry.immediate);
}

function createWatches(model, parentView, templateWatchers) {
    const modelWatchers = model.keys().filter(prop => !prop.startsWith('_')
    && !['events', 'template', 'components', 'layout', 'css', 'scoped', 'scoped_css_support', 'data', 'methods'].includes(prop))
    .reduce((result, prop) => ({
        ...result,
        [prop]: {
            handler(value, oldValue) {
                if (templateWatchers && templateWatchers[prop]) {
                    callTemplateWatcher(this, templateWatchers[prop], value, oldValue);
                }
                /* Don't send changes received from backend back */
                if (_.isEqual(value, model.get(prop))) {
                    return;
                }

                model.set(prop, value === undefined ? null : _.cloneDeep(value));
                model.save_changes(model.callbacks(parentView));
            },
            deep: true,
            immediate: watchesImmediately(templateWatchers && templateWatchers[prop]),
        },
    }), {})
    /* Overwritten keys from templateWatchers are handled in modelWatchers
        so that we eventually call all handlers from templateWatchers. 
    */
    return {...templateWatchers, ...modelWatchers};
}

function createMethods(model, parentView) {
    return model.get('events').reduce((result, event) => {
        // eslint-disable-next-line no-param-reassign
        result[event] = (value, buffers) => {
            if (buffers) {
                const validBuffers = buffers instanceof Array &&
                    buffers[0] instanceof ArrayBuffer;
                if (!validBuffers) {
                    console.warn('second argument is not an BufferArray[View] array')
                    buffers = undefined;
                }
            }
            model.send(
                {event, data: eventToObject(value)},
                model.callbacks(parentView),
                buffers,
            );
        }
        return result;
    }, {});
}

function createInstanceComponents(components, parentView) {
    return components.reduce((result, [name, model]) => {
        // eslint-disable-next-line no-param-reassign
        result[name] = createComponentObject(model, parentView);
        return result;
    }, {});
}

function createClassComponents(components, containerModel, parentView) {
    return components.reduce((accumulator, [componentName, componentSpec]) => ({
        ...accumulator,
        [componentName]: ({
            /* TODO: handle naming collisions. Ignore style traitlet for now */
            props: componentSpec.props.filter(p => p !== 'style'),
            data() {
                return {
                    model: null,
                    id: uuid4(),
                };
            },
            created() {
                const fn = () => {
                    if (!this.model) {
                        const newModel = containerModel.get('_component_instances').find(wm => wm.model_id === this.id);
                        if (newModel) {
                            this.model = newModel;
                        }
                    } else {
                        containerModel.off('change:_component_instances', fn);
                    }
                };
                containerModel.on('change:_component_instances', fn);
                containerModel.send(
                    {
                        create_widget: componentSpec.class, // eslint-disable-line camelcase
                        id: this.id,
                        props: this.$options.propsData,
                    },
                    containerModel.callbacks(parentView),
                );
            },
            destroyed() {
                containerModel.send(
                    {
                        destroy_widget: this.id, // eslint-disable-line camelcase
                    },
                    containerModel.callbacks(parentView),
                );
            },
            watch: componentSpec.props.reduce((watchAccumulator, prop) => ({
                ...watchAccumulator,
                [prop](value) {
                    if (value.objectRef) {
                        containerModel.send(
                            {
                                update_ref: value, // eslint-disable-line camelcase
                                prop,
                                id: this.id,
                            },
                            containerModel.callbacks(parentView),
                        );
                    } else {
                        this.model.set(prop, value);
                        this.model.save_changes(this.model.callbacks(parentView));
                    }
                },
            }), {}),
            render(createElement) {
                if (this.model) {
                    return vueRender(createElement, this.model, parentView, {});
                }
                return createElement('div', ['temp-content']);
            },
        }),
    }), {});
}

function createEsmComponents(components) {
    return components.reduce((accumulator, [componentName, spec]) => ({
        ...accumulator,
        [componentName]: getEsmComponent(spec.esm_module, spec.esm_export),
    }), {});
}

function createFullVueComponents(components) {
    return components.reduce((accumulator, [componentName, vueFile]) => ({
        ...accumulator,
        [componentName]: httpVueLoader(vueFile),
    }), {});
}

/* Returns a map with computed properties so that myProp_ref is available as myProp in the template
 * (only if myProp does not exist).
 */
function aliasRefProps(model) {
    return model.keys()
        .filter(key => key.endsWith('_ref'))
        .map(propRef => [propRef, propRef.substring(0, propRef.length - 4)])
        .filter(([, prop]) => !model.keys().includes(prop))
        .reduce((accumulator, [propRef, prop]) => ({
            ...accumulator,
            [prop]() {
                return this[propRef];
            },
        }), {});
}

function readVueFile(fileContent, sourceURL) {
    const component = parseComponent(fileContent, { pad: 'line' });
    const result = {};

    if (component.template) {
        result.TEMPLATE = component.template.content;
    }
    if (component.script) {
        const { content } = component.script;
        try {
            // Try the new approach first: define module and exports, then evaluate the whole script as if it is a commonjs module
            const module = {
                exports: {}
            };
            /*
               Add sourceURL directive - this helps browser dev tools show better error locations.
               But only add it if not already present in the content (users can add it themselves if they want).
            */
            const hasSourceURL = /\/\/#\s*sourceURL\s*=/i.test(content);
            const contentWithScriptPath = hasSourceURL
                ? content
                : content + `\n//# sourceURL=${sourceURL}`;
            const scriptFunction = new Function('module', 'exports', contentWithScriptPath);
            scriptFunction(module, module.exports);
            result.SCRIPT = module.exports;
        } catch (error) {
            // Fallback to the old approach for backwards compatibility
            console.warn('Failed to evaluate Vue script and find module.exports, falling back to old method, please use module.exports = { ... }');
            try {
                const str = content
                    .substring(content.indexOf('{'), content.length)
                    .replace('\n', ' ');
                // eslint-disable-next-line no-new-func
                result.SCRIPT = Function(`return ${str}`)();
            } catch (fallbackError) {
                console.warn('Failed to evaluate Vue script with both new and old methods:', fallbackError);
                /*  This is a bit like the old behaviour, except we assume the first error is probably correcter
                    moreoften than not, since the old method can fail due to a { being present before module.exports */
                throw error;
            }
        }
    }
    if (component.styles && component.styles.length > 0) {
        const { content } = component.styles[0];
        const { attrs = {} } = component.styles[0];
        const { id } = attrs;
        const scoped = Object.prototype.hasOwnProperty.call(attrs, 'scoped');
        result.STYLE = { content, id, scoped };
    }

    return result;
}

Vue.component('jupyter-widget', {
    props: ['widget'],
    inject: ['viewCtx'],
    data() {
        return {
            component: null,
        };
    },
    created() {
        this.update();
    },
    watch: {
        widget() {
            this.update();
        },
    },
    methods: {
        update() {
            this.viewCtx
                .getModelById(this.widget.substring(10))
                .then((mdl) => {
                    this.component = createComponentObject(mdl, this.viewCtx.getView());
                });
        },
    },
    render(createElement) {
        if (!this.component) {
            return createElement('div');
        }
        return createElement(this.component);
    },
});
