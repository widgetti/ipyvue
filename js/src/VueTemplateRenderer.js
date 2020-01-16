import { createObjectForNestedModel, eventToObject, vueRender } from './VueRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import { WidgetModel } from '@jupyter-widgets/base';

export function vueTemplateRender(createElement, model, parentView) {
    return createElement(createComponentObject(model, parentView));
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
    if (model.get('css')) {
        const style = document.createElement('style');
        style.id = model.cid;
        style.innerHTML = model.get('css');
        document.head.appendChild(style);
        parentView.once('remove', () => {
            document.head.removeChild(style);
        });
    }

    // eslint-disable-next-line no-new-func
    const methods = model.get('methods') ? Function(`return ${model.get('methods').replace('\n', ' ')}`)() : {};
    // eslint-disable-next-line no-new-func
    const data = model.get('data') ? Function(`return ${model.get('data').replace('\n', ' ')}`)() : {};

    const componentEntries = Object.entries(model.get('components') || {});
    const instanceComponents = componentEntries.filter(([k, v]) => v instanceof WidgetModel);
    const classComponents = componentEntries.filter(([k, v]) => !(v instanceof WidgetModel));

    return {
        data() {
            return { ...data, ...createDataMapping(model) };
        },
        created() {
            addModelListeners(model, this);
        },
        watch: createWatches(model, parentView),
        methods: { ...methods, ...createMethods(model, parentView) },
        components: {
            ...createInstanceComponents(instanceComponents, parentView),
            ...createClassComponents(classComponents, model, parentView),
        },
        computed: aliasRefProps(model),
        template: trimTemplateTags(model.get('template')),
    };
}

function trimTemplateTags(template) {
    return template.replace(/^\s*<template>/ig, '').replace(/<\/template>\s*$/ig, '');
}

function createDataMapping(model) {
    return model.keys()
        .filter(prop => !prop.startsWith('_') && !['events', 'template', 'components'].includes(prop))
        .reduce((result, prop) => {
            result[prop] = model.get(prop); // eslint-disable-line no-param-reassign
            return result;
        }, {});
}

function addModelListeners(model, vueModel) {
    model.keys()
        .filter(prop => !prop.startsWith('_') && !['v_model', 'components'].includes(prop))
        // eslint-disable-next-line no-param-reassign
        .forEach(prop => model.on(`change:${prop}`, () => { vueModel[prop] = model.get(prop); }));
}

function createWatches(model, parentView) {
    return model.keys()
        .filter(prop => !prop.startsWith('_') && !['events', 'template', 'components'].includes(prop))
        .reduce((result, prop) => {
            result[prop] = (value) => { // eslint-disable-line no-param-reassign
                model.set(prop, value === undefined ? null : value);
                model.save_changes(model.callbacks(parentView));
            };
            return result;
        }, {});
}

function createMethods(model, parentView) {
    return model.get('events').reduce((result, event) => {
        // eslint-disable-next-line no-param-reassign
        result[event] = value => model.send(
            { event, data: eventToObject(value) },
            model.callbacks(parentView),
        );
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
                    // TODO: use UUID
                    id: `${Math.random()}`.substring(2),
                }
            },
            created() {
                const fn = () => {
                    if (!this.model) {
                        const new_model = containerModel.get('_component_instances').find(wm => wm.model_id === this.id);
                        if (new_model) {
                            this.model = new_model;
                        }
                    } else {
                        containerModel.off('change:_component_instances', fn);
                    }
                };
                containerModel.on('change:_component_instances', fn);
                containerModel.send(
                    {
                        'create_widget': componentSpec.class,
                        'id': this.id,
                        'props': this.$options.propsData,
                    },
                    containerModel.callbacks(parentView));
            },
            destroyed() {
                containerModel.send(
                    {
                        'destroy_widget': this.id,
                    },
                    containerModel.callbacks(parentView));
            },
            watch: componentSpec.props.reduce((accumulator, prop) => ({
                ...accumulator,
                [prop](value) {
                    if (value.PY_REF) {
                        containerModel.send(
                            {
                                'update_ref': value,
                                prop,
                                'id': this.id,
                            },
                            containerModel.callbacks(parentView),
                        );
                    } else {
                        this.model.set(prop, value);
                        this.model.save_changes(this.model.callbacks(parentView));
                    }
                }
            }), {}),
            render(createElement) {
                if (this.model) {
                    return vueRender(createElement, this.model, parentView, {});
                } else {
                    return createElement('div', ['temp-content']);
                }
            }
        }),
    }), {})
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
