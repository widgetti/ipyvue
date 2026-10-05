/* eslint camelcase: ['error', {allow: ['v_model']}] */
import * as base from '@jupyter-widgets/base';
import { vueTemplateRender } from './VueTemplateRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import Vue from './VueWithCompiler';

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
        render(createElement) {
            return createElement('div', { style: { height: '100%' } });
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

export function vueRender(createElement, model, parentView, slotScopes) {
    if (model instanceof VueTemplateModel) {
        return vueTemplateRender(createElement, model, parentView);
    }
    if (!(model instanceof VueModel)) {
        return createElement(createObjectForNestedModel(model, parentView));
    }
    const tag = model.getVueTag();

    const elem = createElement({
        data() {
            return {
                v_model: model.get('v_model'),
            };
        },
        created() {
            addListeners(model, this);
        },
        render(createElement2) {
            const element = createElement2(
                tag,
                createContent(createElement2, model, this, parentView, slotScopes),
                renderChildren(createElement2, model.get('children'), this, parentView, slotScopes),
            );
            updateCache(this);
            return element;
        },
    }, { ...model.get('slot') && { slot: model.get('slot') } });

    /* Impersonate the wrapped component (e.g. v-tabs uses this name to detect v-tab and
     * v-tab-item) */
    elem.componentOptions.Ctor.options.name = tag;
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
        if (vueModel.v_model === "!!disabled!!") {
            vueModel.$forceUpdate();
        }
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
    /* Example Vue.compile output:
     * (function anonymous() {
     *         with (this) {
     *             return _c('dummy', {
     *                 on: {
     *                     "[event]": function ($event) {
     *                         if (!$event.type.indexOf('key') && _k($event.keyCode, "c", ...)
     *                             return null;
     *                         ...
     *                         return [fn]($event)
     *                     }
     *                 }
     *             })
     *         }
     *     }
     * )
     */
    const { on } = Vue.compile(`<dummy @${eventAndModifiers}="fn"></dummy>`)
        .render.bind({
            _c: (_, data) => data,
            _k: Vue.prototype._k,
            fn,
        })();

    return {
        ...obj,
        ...on,
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

function createSlots(createElement, model, vueModel, parentView, slotScopes) {
    const slots = model.get('v_slots');
    if (!slots) {
        return undefined;
    }
    return slots.map(slot => ({
        key: slot.name,
        ...!slot.variable && { proxy: true },
        fn(slotScope) {
            return renderChildren(createElement,
                Array.isArray(slot.children) ? slot.children : [slot.children],
                vueModel, parentView, {
                    ...slotScopes,
                    ...slot.variable && { [slot.variable]: slotScope },
                });
        },
    }));
}

function getScope(value, slotScopes) {
    const parts = value.split('.');
    return parts
        .slice(1)
        .reduce(
            (scope, name) => scope[name],
            slotScopes[parts[0]],
        );
}

function getScopes(value, slotScopes) {
    return typeof value === 'string'
        ? getScope(value, slotScopes)
        : Object.assign({}, ...value.map(v => getScope(v, slotScopes)));
}

function slotUseOn(model, slotScopes) {
    const vOnValue = model.get('v_on');
    return vOnValue && getScopes(vOnValue, slotScopes);
}

function createContent(createElement, model, vueModel, parentView, slotScopes) {
    const htmlEventAttributes = model.get('attributes') && Object.keys(model.get('attributes')).filter(key => key.startsWith('on'));
    if (htmlEventAttributes && htmlEventAttributes.length > 0) {
        throw new Error(`No HTML event attributes may be used: ${htmlEventAttributes}`);
    }

    const scopedSlots = createSlots(createElement, model, vueModel, parentView, slotScopes);

    return {
        on: { ...createEventMapping(model, parentView), ...slotUseOn(model, slotScopes) },
        ...model.get('style_') && { style: model.get('style_') },
        ...model.get('class_') && { class: model.get('class_') },
        ...scopedSlots && { scopedSlots: vueModel._u(scopedSlots) },
        attrs: {
            ...createAttrsMapping(model),
            ...model.get('attributes') && model.get('attributes'),
        },
        ...model.get('v_model') !== '!!disabled!!' && {
            model: {
                value: vueModel.v_model,
                callback: (v) => {
                    model.set('v_model', v === undefined ? null : v);
                    model.save_changes(model.callbacks(parentView));
                },
                expression: 'v_model',
            },
        },
    };
}

function renderChildren(createElement, children, vueModel, parentView, slotScopes) {
    if (!vueModel.childCache) {
        vueModel.childCache = {}; // eslint-disable-line no-param-reassign
    }
    if (!vueModel.childIds) {
        vueModel.childIds = []; // eslint-disable-line no-param-reassign
    }
    const childViewModels = children.map((child) => {
        if (typeof (child) === 'string') {
            return child;
        }
        vueModel.childIds.push(child.cid);

        if (vueModel.childCache[child.cid]) {
            return vueModel.childCache[child.cid];
        }
        const vm = vueRender(createElement, child, parentView, slotScopes);
        vueModel.childCache[child.cid] = vm; // eslint-disable-line no-param-reassign
        return vm;
    });

    return childViewModels;
}

function updateCache(vueModel) {
    Object.keys(vueModel.childCache)
        .filter(key => !vueModel.childIds.includes(key))
        // eslint-disable-next-line no-param-reassign
        .forEach(key => delete vueModel.childCache[key]);
    vueModel.childIds = []; // eslint-disable-line no-param-reassign
}
