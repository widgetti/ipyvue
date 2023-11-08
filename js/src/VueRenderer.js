/* eslint camelcase: ['error', {allow: ['v_model']}] */
import * as base from '@jupyter-widgets/base';
import { vueTemplateRender } from './VueTemplateRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import * as Vue from 'vue';

const JupyterPhosphorWidget = base.JupyterPhosphorWidget || base.JupyterLuminoWidget;

export function createObjectForNestedModel(model, parentView) {
    let currentView =  null;
    let destroyed = false;
    return {
        mounted() {
            parentView
                .create_child_view(model)
                .then(view => {
                    currentView = view;
                    // since create view is async, the vue component might be destroyed before the view is created
                    if(!destroyed) {
                        if(JupyterPhosphorWidget && (view.pWidget || view.luminoWidget || view.lmWidget)) {
                            JupyterPhosphorWidget.attach(view.pWidget || view.luminoWidget || view.lmWidget, this.$el);
                        } else {
                            console.error("Could not attach widget to DOM using Lumino or Phosphor. Fallback to normal DOM attach", JupyterPhosphorWidget, view.pWidget, view.luminoWidget, view.lmWidget);
                            this.$el.appendChild(view.el);

                        }
                    } else {
                        currentView.remove();
                    }
                });
        },
        beforeDestroy() {
            if (currentView) {
                // In vue 3 we can use the beforeUnmount, which is called before the node is removed from the DOM
                // In vue 2, we are already disconnected from the document at this stage, which phosphor does not like.
                // In order to avoid an error in phosphor, we add the node to the body before removing it.
                // (current.remove triggers a phosphor detach)
                // To be sure we do not cause any flickering, we hide the node before moving it.
                const widget = currentView.pWidget || currentView.luminoWidget || currentView.lmWidget;
                widget.node.style.display = "none";
                document.body.appendChild(widget.node)
                currentView.remove();
            } else {
                destroyed = true;
            }
        },
        render() {
            return Vue.h('div', { style: { height: '100%' } });
        },
    };
}

// based on https://stackoverflow.com/a/58416333/5397207
function pickSerializable(object, depth=0, max_depth=2) {
    // change max_depth to see more levels, for a touch event, 2 is good
    if (depth > max_depth)
        return 'Object';

    const obj = {};
    for (let key in object) {
        let value = object[key];
        if (value instanceof Node)
            // specify which properties you want to see from the node
            value = {id: value.id};
        else if (value instanceof Window)
            value = 'Window';
        else if (value instanceof Object)
            value = pickSerializable(value, depth+1, max_depth);

        obj[key] = value;
    }

    return obj;
}

export function eventToObject(event) {
    if (event instanceof Event) {
        return pickSerializable(event);
    }
    return event;
}

function resolve(componentOrTag) {
    const tagCheck = document.createElement(componentOrTag).toString();
    if (!["[object HTMLUnknownElement]", "[object HTMLElement]"].includes(tagCheck)) {
        /* this is a default HTML-tag */
        return componentOrTag;
    }
    try {
        return Vue.resolveComponent(componentOrTag);
    } catch (e) {
        return componentOrTag;
    }
}

export function vueRender(model, parentView, slotScopes) {
    if (model instanceof VueTemplateModel) {
        return vueTemplateRender(model, parentView);
    }
    if (!(model instanceof VueModel)) {
        return Vue.h(createObjectForNestedModel(model, parentView));
    }
    const tag = model.getVueTag();

    const childCache = {};

    const elem = Vue.h({
        data() {
            return {
                v_model: model.get('v_model'),
            };
        },
        created() {
            addListeners(model, this);
        },
        render() {
            const element = Vue.h(
                resolve(tag),
                createContent(model, this, parentView, slotScopes),
                {
                    default: () => {
                        updateCache(childCache, (model.get('children') || []).map(m => m.cid));
                        return renderChildren(model.get('children'), childCache, parentView, slotScopes);
                    },
                    ...createSlots(model, this, parentView, slotScopes)
                },
            );

            return element;
        },
    }, { ...model.get('slot') && { slot: model.get('slot') } });

    return elem;
}

function addListeners(model, vueModel) {
    const listener = () => {
        vueModel.$forceUpdate();
    };
    const use = key => key === '_events' || (!key.startsWith('_') && !['v_model'].includes(key));

    model.keys()
        .filter(use)
        .forEach(key => model.on(`change:${key}`, listener));

    model.on('change:v_model', () => {
        if (model.get('v_model') !== vueModel.v_model) {
            vueModel.v_model = model.get('v_model'); // eslint-disable-line no-param-reassign
        }
    });
}

function createAttrsMapping(model) {
    const useAsAttr = key => model.get(key) !== null
        && !key.startsWith('_')
        && !['attributes', 'v_slots', 'v_on', 'layout', 'children', 'slot', 'v_model', 'style_', 'class_'].includes(key);

    return model.keys()
        .filter(useAsAttr)
        .reduce((result, key) => {
            result[key.replace(/_$/g, '').replace(/_/g, '-')] = model.get(key); // eslint-disable-line no-param-reassign
            return result;
        }, {});
}

function addEventWithModifiers(eventAndModifiers, obj, fn) { // eslint-disable-line no-unused-vars
    const [event, ...mods] = eventAndModifiers.split(".");

    return {
        ...obj,
        [`on${event.charAt(0).toUpperCase()}${event.slice(1)}`]: Vue.withModifiers(fn, mods),
    };
}

function createEventMapping(model, parentView) {
    return (model.get('_events') || [])
        .reduce((result, eventAndModifiers) => addEventWithModifiers(
            eventAndModifiers,
            result,
            (e) => {
                model.send({
                    event: eventAndModifiers,
                    data: eventToObject(e),
                },
                model.callbacks(parentView));
            },
        ), {});
}

function createSlots(model, vueModel, parentView, slotScopes) {
    const slots = model.get('v_slots');
    if (!slots) {
        return undefined;
    }
    const childCache = {};

    return slots.reduce((res, slot) => ({
        ...res,
        [slot.name]: (slotScope) => {
            return renderChildren(
                Array.isArray(slot.children) ? slot.children : [slot.children],
                childCache, parentView, {
                    ...slotScopes,
                    ...slot.variable && { [slot.variable]: slotScope },
                });
        },
    }), {});
}

function slotUseOn(model, slotScopes) {
    const vOnValue = model.get('v_on');
    return vOnValue && filterObject(slotScopes[vOnValue.split('.')[0]].props, (key, value) => key.startsWith('on'))
}

function filterObject(obj, predicate) {
    return Object.entries(obj)
        .filter(([key, value]) => predicate(key, value))
        .reduce((res, [key, value]) => ({...res, [key]: value }), {});
}

function createContent(model, vueModel, parentView, slotScopes) {
    const htmlEventAttributes = model.get('attributes') && Object.keys(model.get('attributes')).filter(key => key.startsWith('on'));
    if (htmlEventAttributes && htmlEventAttributes.length > 0) {
        throw new Error(`No HTML event attributes may be used: ${htmlEventAttributes}`);
    }

    return {
        ...slotUseOn(model, slotScopes),
        ...createEventMapping(model, parentView),
        ...model.get('style_') && { style: model.get('style_') },
        ...model.get('class_') && { class: model.get('class_') },
        ...createAttrsMapping(model),
        ...model.get('attributes') && model.get('attributes'),
        ...model.get('v_model') !== '!!disabled!!' && {
            modelValue: vueModel.v_model,
            "onUpdate:modelValue": (v) => {
                model.set('v_model', v === undefined ? null : v);
                model.save_changes(model.callbacks(parentView));
            },
        },
    };
}

function renderChildren(children, childCache, parentView, slotScopes) {
    const childViewModels = children.map((child) => {
        if (typeof (child) === 'string') {
            return child;
        }
        if (childCache[child.cid]) {
            return childCache[child.cid];
        }
        const vm = vueRender(child, parentView, slotScopes);
        childCache[child.cid] = vm; // eslint-disable-line no-param-reassign
        return vm;
    });

    return childViewModels;
}

function updateCache(childCache, usedChildIds) {
    Object.keys(childCache)
        .filter(key => !usedChildIds.includes(key))
        // eslint-disable-next-line no-param-reassign
        .forEach(key => delete childCache[key]);
}
