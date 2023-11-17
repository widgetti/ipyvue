import { WidgetModel } from '@jupyter-widgets/base';
import uuid4 from 'uuid/v4';
import _ from 'lodash';
import * as Vue from 'vue';
import { createObjectForNestedModel, eventToObject, vueRender } from './VueRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import { TemplateModel } from './Template';
import {getAsyncComponent} from "./esmVueTemplate";

export function vueTemplateRender(model, parentView) {
    return Vue.h(createComponentObject(model, parentView));
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

    const componentEntries = Object.entries(model.get('components') || {});
    const instanceComponents = componentEntries.filter(([, v]) => v instanceof WidgetModel);
    const classComponents = componentEntries.filter(([, v]) => !(v instanceof WidgetModel) && !(typeof v === 'string'));
    const fullVueComponents = componentEntries.filter(([, v]) => typeof v === 'string');

    return getAsyncComponent(
        template,
        {
            ...createModelMixin(model, templateModel, parentView),
            components: {
                ...createInstanceComponents(instanceComponents, parentView),
                ...createClassComponents(classComponents, model, parentView),
                ...createFullVueComponents(fullVueComponents),
            },
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
            this.__onTemplateChange = () => {
                this.$root.$forceUpdate();
            };
            templateModel.on('change:template', this.__onTemplateChange);
            addModelListeners(model, this);
        },
        methods: createMethods(model, parentView),
        computed: aliasRefProps(model),
    });
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
                        props: this.$props,
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
            render() {
                if (this.model) {
                    return vueRender(this.model, parentView, {});
                }
                return Vue.h('div', ['temp-content']);
            },
        }),
    }), {});
}

function createFullVueComponents(components) {
    return components.reduce((accumulator, [componentName, vueFile]) => ({
        ...accumulator,
        [componentName]: getAsyncComponent(vueFile, {}),
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
    const component = Vue.shallowRef(null);
    return {
        props: ['widget'],
        inject: ['viewCtx'],
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
                        component.value = createComponentObject(mdl, this.viewCtx.getView());
                    });
            },
        },
        render() {
            if (!component.value) {
                return Vue.h('div');
            }
            return Vue.h(component.value);
        },
    }
}
