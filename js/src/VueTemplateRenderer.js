import { WidgetModel } from '@jupyter-widgets/base';
import { v4 as uuid4 } from 'uuid';
import _ from 'lodash';
import * as Vue from 'vue';
import { createObjectForNestedModel, eventToObject, vueRender } from './VueRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import { TemplateModel } from './Template';
import {getAsyncComponent, getEsmAsyncComponent, getEsmComponent} from "./esmVueTemplate";

const templateRefreshVersions = new WeakMap();
const templateOwners = new WeakMap();
const templateComponentCache = new WeakMap();
const templateModelsByTemplate = new WeakMap();
const viewRootOwners = new WeakMap();
const templateModelRefreshListeners = new WeakSet();
const vueTemplateModelRefreshListeners = new WeakSet();
const exposedMethodCache = new WeakMap();
const defaultParentViewCacheKey = {};

export function vueTemplateRender(model, parentView) {
    if (model instanceof VueTemplateModel) {
        ensureTemplateRefreshListeners(model);
        addTemplateOwner(templateRefreshTarget(model), parentView);
    }
    return Vue.h(createComponentObject(model, parentView), {
        key: templateRenderKey(model),
    });
}

function createComponentObject(model, parentView) {
    if (model instanceof VueModel) {
        return {
            render() {
                return vueRender(model, parentView, {});
            },
        };
    }
    if (!(model instanceof VueTemplateModel)) {
        return createObjectForNestedModel(model, parentView);
    }

    const isTemplateModel = model.get('template') instanceof TemplateModel;
    const templateModel = isTemplateModel ? model.get('template') : model;
    const template = templateModel.get('template');
    ensureTemplateRefreshListeners(model);

    const componentEntries = Object.entries(model.get('components') || {});
    const instanceComponents = componentEntries.filter(([, v]) => v instanceof WidgetModel);
    const classComponents = componentEntries.filter(([, v]) => !(v instanceof WidgetModel) && !(typeof v === 'string') && !(v && v.esm_module));
    const esmComponents = componentEntries.filter(([, v]) => v && v.esm_module);
    const fullVueComponents = componentEntries.filter(([, v]) => typeof v === 'string');

    const esmModule = templateModel.get('esm_module');
    if (esmModule) {
        return getEsmAsyncComponent(esmModule, templateModel.get('esm_export'), {
            ...createModelMixin(model, templateModel, parentView),
            components: {
                ...createInstanceComponents(instanceComponents, parentView),
                ...createClassComponents(classComponents, model, parentView),
                ...createFullVueComponents(fullVueComponents),
                ...createEsmComponents(esmComponents),
            },
        });
    }

    return getAsyncComponent(
        template,
        {
            ...createModelMixin(model, templateModel, parentView),
            components: {
                ...createInstanceComponents(instanceComponents, parentView),
                ...createClassComponents(classComponents, model, parentView),
                ...createFullVueComponents(fullVueComponents),
                ...createEsmComponents(esmComponents),
            },
        },
        {
            styleOwnerKey: `template-${templateModel.model_id}`,
            sourceURL: templateModel.get('source_url') || `ipyvue-template-${templateModel.model_id}.vue`,
        }
    );
}

export function createModelMixin(model, templateModel, parentView) {
    return ({
        inject: ['viewCtx'],
        data: () => {
            return createDataMapping(model);
        },
        watch: createWatches(model, parentView),
        created() {
            if (typeof this.viewCtx.refreshRoot === 'function') {
                this.__templateRootOwner = {
                    update: () => this.viewCtx.refreshRoot(),
                };
                addTemplateOwnerInstance(templateModel, this.__templateRootOwner);
            }
            this.__onTemplateChange = () => {
                refreshTemplateOwners(templateModel, () => {
                    if (typeof this.viewCtx.refreshRoot === 'function') {
                        this.viewCtx.refreshRoot();
                    } else {
                        this.$root.$forceUpdate();
                    }
                });
            };
            templateModel.on('change:template', this.__onTemplateChange);
            templateModel.on('change:source_url', this.__onTemplateChange);
            templateModel.on('change:esm_module', this.__onTemplateChange);
            templateModel.on('change:esm_export', this.__onTemplateChange);
            model.on('change:components change:events', this.__onTemplateChange);
            addModelListeners(model, this);
        },
        beforeUnmount() {
            removeTemplateOwner(templateModel, this.$);
            if (this.__templateRootOwner) {
                removeTemplateOwner(templateModel, this.__templateRootOwner);
                this.__templateRootOwner = null;
            }
            if (this.__onTemplateChange) {
                templateModel.off('change:template', this.__onTemplateChange);
                templateModel.off('change:source_url', this.__onTemplateChange);
                templateModel.off('change:esm_module', this.__onTemplateChange);
                templateModel.off('change:esm_export', this.__onTemplateChange);
                model.off('change:components change:events', this.__onTemplateChange);
                this.__onTemplateChange = null;
            }
        },
        methods: createMethods(model, parentView),
        computed: aliasRefProps(model),
    });
}

function addTemplateOwner(templateModel, parentView) {
    const owner = Vue.getCurrentInstance();
    if (owner) {
        addTemplateOwnerInstance(templateModel, owner);
    }
    const rootOwner = viewRootOwner(templateModel, parentView);
    if (rootOwner) {
        addTemplateOwnerInstance(templateModel, rootOwner);
    }
}

function addTemplateOwnerInstance(templateModel, owner) {
    pruneTemplateOwners(templateModel).add(owner);
}

function viewRootOwner(templateModel, parentView) {
    if (!parentView || typeof parentView.refreshRoot !== 'function') {
        return null;
    }

    let owners = viewRootOwners.get(parentView);
    if (!owners) {
        owners = new WeakMap();
        viewRootOwners.set(parentView, owners);
    }

    let owner = owners.get(templateModel);
    if (!owner) {
        owner = {
            update: () => parentView.refreshRoot(),
        };
        owners.set(templateModel, owner);
    }
    return owner;
}

function removeTemplateOwner(templateModel, owner) {
    const owners = templateOwners.get(templateModel);
    if (owners) {
        owners.delete(owner);
    }
}

function pruneTemplateOwners(templateModel) {
    const owners = templateOwners.get(templateModel) || new Set();
    [...owners]
        .filter(owner => owner.isUnmounted)
        .forEach(owner => owners.delete(owner));
    templateOwners.set(templateModel, owners);
    return owners;
}

function forceUpdateOwner(owner) {
    if (owner.proxy && typeof owner.proxy.$forceUpdate === 'function') {
        owner.proxy.$forceUpdate();
    } else if (typeof owner.update === 'function') {
        owner.update();
    }
}

function refreshTemplateOwners(templateModel, fallback) {
    refreshTemplateModelViews(templateModel);
    const owners = pruneTemplateOwners(templateModel);
    if (!owners.size) {
        fallback();
        return;
    }
    Array.from(owners).forEach(forceUpdateOwner);
}

function bumpTemplateRefreshVersion(templateModel) {
    templateRefreshVersions.set(
        templateModel,
        (templateRefreshVersions.get(templateModel) || 0) + 1,
    );
}

function templateRefreshTarget(model) {
    return model.get('template') instanceof TemplateModel ? model.get('template') : model;
}

function ensureTemplateRefreshListeners(model) {
    const templateModel = templateRefreshTarget(model);
    let templateModels = templateModelsByTemplate.get(templateModel);
    if (!templateModels) {
        templateModels = new Set();
        templateModelsByTemplate.set(templateModel, templateModels);
    }
    templateModels.add(model);

    if (!templateModelRefreshListeners.has(templateModel)) {
        const bumpVersion = () => bumpTemplateRefreshVersion(templateModel);
        templateModel.on('change:template', bumpVersion);
        templateModel.on('change:source_url', bumpVersion);
        templateModel.on('change:esm_module', bumpVersion);
        templateModel.on('change:esm_export', bumpVersion);
        templateModelRefreshListeners.add(templateModel);
    }

    if (model instanceof VueTemplateModel && !vueTemplateModelRefreshListeners.has(model)) {
        model.on('change:components change:events', () => bumpTemplateRefreshVersion(templateModel));
        vueTemplateModelRefreshListeners.add(model);
    }
}

function refreshTemplateModelViews(templateModel) {
    const models = templateModelsByTemplate.get(templateModel);
    if (!models) {
        return;
    }
    models.forEach((model) => {
        Object.values(model.views || {}).forEach((viewPromise) => {
            Promise.resolve(viewPromise).then((view) => {
                if (view && typeof view.refreshRoot === 'function') {
                    view.refreshRoot();
                }
                if (view && view.vueApp && view.vueApp._instance
                    && typeof view.vueApp._instance.update === 'function') {
                    view.vueApp._instance.update();
                }
            });
        });
    });
}

function parentViewCacheKey(parentView) {
    if (parentView && (typeof parentView === 'object' || typeof parentView === 'function')) {
        return parentView;
    }
    return defaultParentViewCacheKey;
}

function cachedTemplateComponent(model, parentView) {
    let parentCache = templateComponentCache.get(model);
    if (!parentCache) {
        parentCache = new WeakMap();
        templateComponentCache.set(model, parentCache);
    }

    const cacheKey = parentViewCacheKey(parentView);
    const renderKey = templateRenderKey(model);
    const cached = parentCache.get(cacheKey);
    if (cached && cached.renderKey === renderKey) {
        return cached.component;
    }

    const component = createComponentObject(model, parentView);
    parentCache.set(cacheKey, { renderKey, component });
    return component;
}

export function templateRenderKey(model) {
    const templateModel = templateRefreshTarget(model);
    return `${model.model_id}:${templateModel.model_id}:${templateRefreshVersions.get(templateModel) || 0}`;
}

function createDataMapping(model) {
    return model.keys()
        .filter(prop => !prop.startsWith('_')
            && !['events', 'template', 'components', 'layout', 'css', 'data', 'methods'].includes(prop))
        .reduce((result, prop) => {
            result[prop] = _.cloneDeep(model.get(prop)); // eslint-disable-line no-param-reassign
            return result;
        }, {});
}

function addModelListeners(model, vueModel) {
    model.keys()
        .filter(prop => !prop.startsWith('_')
            && !['v_model', 'components', 'layout', 'css', 'data', 'methods'].includes(prop))
        // eslint-disable-next-line no-param-reassign
        .forEach(prop => model.on(`change:${prop}`, () => {
            if (_.isEqual(model.get(prop), vueModel[prop])) {
                return;
            }
            vueModel[prop] = _.cloneDeep(model.get(prop));
        }));
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
    });
}

function createWatches(model, parentView) {
    return model.keys()
        .filter(prop => !prop.startsWith('_')
            && !['events', 'template', 'components', 'layout', 'css', 'data', 'methods'].includes(prop))
        .reduce((result, prop) => ({
            ...result,
            [prop]: {
                handler(value) {
                    /* Don't send changes received from backend back */
                    if (_.isEqual(value, model.get(prop))) {
                        return;
                    }

                    model.set(prop, value === undefined ? null : _.cloneDeep(value));
                    model.save_changes(model.callbacks(parentView));
                },
                deep: true,
            },
        }), {});
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
        result[name] = model instanceof VueTemplateModel
            ? createInstanceComponent(model, parentView)
            : createComponentObject(model, parentView);
        return result;
    }, {});
}

function createInstanceComponent(model, parentView) {
    return {
        inheritAttrs: false,
        setup(props, { attrs, expose, slots }) {
            const innerRef = Vue.ref(null);
            ensureTemplateRefreshListeners(model);
            expose(new Proxy({}, {
                get(target, key) {
                    const inner = innerRef.value;
                    if (!inner) {
                        return undefined;
                    }
                    const value = inner[key];
                    return typeof value === 'function' ? boundExposedMethod(inner, key, value) : value;
                },
                set(target, key, value) {
                    const inner = innerRef.value;
                    if (!inner) {
                        return true;
                    }
                    inner[key] = value;
                    return true;
                },
                has(target, key) {
                    return innerRef.value ? key in innerRef.value : false;
                },
            }));

            return () => {
                ensureTemplateRefreshListeners(model);
                addTemplateOwner(templateRefreshTarget(model), parentView);
                return Vue.h(
                    cachedTemplateComponent(model, parentView),
                    { ...attrs, key: templateRenderKey(model), ref: innerRef },
                    slots,
                );
            };
        },
    };
}

function boundExposedMethod(inner, key, value) {
    let methods = exposedMethodCache.get(inner);
    if (!methods) {
        methods = new Map();
        exposedMethodCache.set(inner, methods);
    }

    const cached = methods.get(key);
    if (cached && cached.value === value) {
        return cached.bound;
    }

    const bound = value.bind(inner);
    methods.set(key, { value, bound });
    return bound;
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
                        props: this.$props,
                    },
                    containerModel.callbacks(parentView),
                );
            },
            beforeUnmount() {
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
            render() {
                if (this.model) {
                    return vueRender(this.model, parentView, {});
                }
                return Vue.h('div', ['temp-content']);
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
        [componentName]: getAsyncComponent(vueFile, {}, {
            sourceURL: `ipyvue-component-${componentName}.vue`,
        }),
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

export function jupyterWidgetComponent() {
    return {
        props: ['widget'],
        inject: ['viewCtx'],
        data() {
            return {
                component: null,
                model: null,
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
                if (this.model instanceof VueTemplateModel && this.__templateRootOwner) {
                    removeTemplateOwner(templateRefreshTarget(this.model), this.__templateRootOwner);
                }
                this.viewCtx
                    .getModelById(this.widget.substring(10))
                    .then((mdl) => {
                        this.model = mdl;
                        if (mdl instanceof VueTemplateModel && typeof this.viewCtx.refreshRoot === 'function') {
                            this.__templateRootOwner = this.__templateRootOwner || {
                                update: () => this.viewCtx.refreshRoot(),
                            };
                            addTemplateOwnerInstance(
                                templateRefreshTarget(mdl),
                                this.__templateRootOwner,
                            );
                        }
                        this.component = mdl instanceof VueTemplateModel
                            ? null
                            : Vue.markRaw(createComponentObject(mdl, this.viewCtx.getView()));
                    });
            },
        },
        beforeUnmount() {
            if (this.model instanceof VueTemplateModel) {
                removeTemplateOwner(templateRefreshTarget(this.model), this.$);
                if (this.__templateRootOwner) {
                    removeTemplateOwner(templateRefreshTarget(this.model), this.__templateRootOwner);
                }
            }
        },
        render() {
            if (this.model instanceof VueTemplateModel) {
                ensureTemplateRefreshListeners(this.model);
                addTemplateOwner(templateRefreshTarget(this.model), this.viewCtx.getView());
                return Vue.h(
                    cachedTemplateComponent(this.model, this.viewCtx.getView()),
                    { key: templateRenderKey(this.model) },
                );
            }
            if (!this.component) {
                return Vue.h('div');
            }
            return Vue.h(this.component);
        },
    }
}
