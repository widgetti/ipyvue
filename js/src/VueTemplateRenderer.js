import { WidgetModel } from '@jupyter-widgets/base';
import uuid4 from 'uuid/v4';
import _ from 'lodash';
import Vue from 'vue';
import { parseComponent } from '@mariobuikhuizen/vue-compiler-addon';
import { createObjectForNestedModel, eventToObject, vueRender } from './VueRenderer'; // eslint-disable-line import/no-cycle
import { VueModel } from './VueModel';
import { VueTemplateModel } from './VueTemplateModel';
import httpVueLoader from './httpVueLoader';
import { TemplateModel } from './Template';

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

    const isTemplateModel = model.get('template') instanceof TemplateModel;
    const templateModel = isTemplateModel ? model.get('template') : model;
    const template = templateModel.get('template');
    const vuefile = readVueFile(template);

    const css = model.get('css') || (vuefile.STYLE && vuefile.STYLE.content);
    const cssId = (vuefile.STYLE && vuefile.STYLE.id);

    if (css) {
        if (cssId) {
            const prefixedCssId = `ipyvue-${cssId}`;
            let style = document.getElementById(prefixedCssId);
            if (!style) {
                style = document.createElement('style');
                style.id = prefixedCssId;
                document.head.appendChild(style);
            }
            if (style.innerHTML !== css) {
                style.innerHTML = css;
            }
        } else {
            const style = document.createElement('style');
            style.id = model.cid;
            style.innerHTML = css;
            document.head.appendChild(style);
            parentView.once('remove', () => {
                document.head.removeChild(style);
            });
        }
    }

    // eslint-disable-next-line no-new-func
    const methods = model.get('methods') ? Function(`return ${model.get('methods').replace('\n', ' ')}`)() : {};
    // eslint-disable-next-line no-new-func
    const data = model.get('data') ? Function(`return ${model.get('data').replace('\n', ' ')}`)() : {};

    const componentEntries = Object.entries(model.get('components') || {});
    const instanceComponents = componentEntries.filter(([, v]) => v instanceof WidgetModel);
    const classComponents = componentEntries.filter(([, v]) => !(v instanceof WidgetModel) && !(typeof v === 'string'));
    const fullVueComponents = componentEntries.filter(([, v]) => typeof v === 'string');

    function callVueFn(name, this_) {
        if (vuefile.SCRIPT && vuefile.SCRIPT[name]) {
            vuefile.SCRIPT[name].bind(this_)();
        }
    }

    return {
        inject: ['viewCtx'],
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
            templateModel.on('change:template', this.__onTemplateChange);
            addModelListeners(model, this);
            callVueFn('created', this);
        },
        watch: createWatches(model, parentView, vuefile.SCRIPT && vuefile.SCRIPT.watch),
        methods: {
            ...vuefile.SCRIPT && vuefile.SCRIPT.methods,
            ...methods,
            ...createMethods(model, parentView),
        },
        components: {
            ...createInstanceComponents(instanceComponents, parentView),
            ...createClassComponents(classComponents, model, parentView),
            ...createFullVueComponents(fullVueComponents),
        },
        computed: { ...vuefile.SCRIPT && vuefile.SCRIPT.computed, ...aliasRefProps(model) },
        template: vuefile.TEMPLATE === undefined && vuefile.SCRIPT === undefined && vuefile.STYLE === undefined
            ? template
            : vuefile.TEMPLATE,
        beforeMount() {
            callVueFn('beforeMount', this);
        },
        mounted() {
            callVueFn('mounted', this);
        },
        beforeUpdate() {
            callVueFn('beforeUpdate', this);
        },
        updated() {
            callVueFn('updated', this);
        },
        beforeDestroy() {
            templateModel.off('change:template', this.__onTemplateChange);
            callVueFn('beforeDestroy', this);
        },
        destroyed() {
            callVueFn('destroyed', this);
        },
    };
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

function createWatches(model, parentView, templateWatchers) {
    const modelWatchers = model.keys().filter(prop => !prop.startsWith('_')
    && !['events', 'template', 'components', 'layout', 'css', 'data', 'methods'].includes(prop))
    .reduce((result, prop) => ({
        ...result,
        [prop]: {
            handler(value) {
                if (templateWatchers && templateWatchers[prop]) {
                    templateWatchers[prop].bind(this)(value);
                }
                /* Don't send changes received from backend back */
                if (_.isEqual(value, model.get(prop))) {
                    return;
                }

                model.set(prop, value === undefined ? null : _.cloneDeep(value));
                model.save_changes(model.callbacks(parentView));
            },
            deep: true,
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

function readVueFile(fileContent) {
    const component = parseComponent(fileContent, { pad: 'line' });
    const result = {};

    if (component.template) {
        result.TEMPLATE = component.template.content;
    }
    if (component.script) {
        const { content } = component.script;
        const str = content
            .substring(content.indexOf('{'), content.length)
            .replace('\n', ' ');

        // eslint-disable-next-line no-new-func
        result.SCRIPT = Function(`return ${str}`)();
    }
    if (component.styles && component.styles.length > 0) {
        const { content } = component.styles[0];
        const { id } = component.styles[0].attrs;
        result.STYLE = { content, id };
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
