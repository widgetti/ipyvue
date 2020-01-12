/* eslint camelcase: ['error', {allow: ['v_model']}] */
import { JupyterPhosphorWidget } from '@jupyter-widgets/base';
import { vueTemplateRender } from './VueTemplateRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import Vue from './VueWithCompiler';

export function createObjectForNestedModel(model, parentView) {

    return {
        mounted() {
            parentView
                .create_child_view(model)
                .then(view => JupyterPhosphorWidget.attach(view.pWidget, this.$el));
        },
        render(createElement) {
            return createElement('div', { style: { height: '100%' } });
        },
    };
}

export function eventToObject(event) {
    if (event == null) {
        return event;
    }
    let props;
    switch (event.constructor) {
        case MouseEvent:
            props = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'offsetX', 'offsetY', 'clientX', 'clientY', 'pageX', 'pageY', 'screenX', 'screenY', 'shiftKey', 'x', 'y'];
            break;
        case WheelEvent:
            props = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'offsetX', 'offsetY', 'clientX', 'clientY', 'pageX', 'pageY', 'screenX', 'screenY', 'shiftKey', 'x', 'y', 'wheelDelta', 'wheelDeltaX', 'wheelDeltaY'];
            break;
        // TODO: More events
        default:
            return event;
    }

    return props.reduce(
        (result, key) => {
            result[key] = event[key]; // eslint-disable-line no-param-reassign
            return result;
        }, {},
    );
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
            return createElement2(
                tag,
                createContent(createElement2, model, this, parentView, slotScopes),
                renderChildren(createElement2, model.get('children'), this, parentView, slotScopes),
            );
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
            result[key.replace(/_/g, '-')] = model.get(key); // eslint-disable-line no-param-reassign
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
    const childViewModels = children.map((child) => {
        if (typeof (child) === 'string') {
            return child;
        }
        if (vueModel.childCache[child.cid]) {
            return vueModel.childCache[child.cid];
        }
        const vm = vueRender(createElement, child, parentView, slotScopes);
        vueModel.childCache[child.cid] = vm; // eslint-disable-line no-param-reassign
        return vm;
    });

    /* Remove unused components */
    const childIds = children.map(child => child.cid);
    Object.keys(vueModel.childCache)
        .filter(key => !childIds.includes(key))
        // eslint-disable-next-line no-param-reassign
        .forEach(key => delete vueModel.childCache[key]);
    return childViewModels;
}
