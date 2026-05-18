import { DOMWidgetView } from '@jupyter-widgets/base';
import * as Vue from 'vue';
import { vueRender } from './VueRenderer';
import {addApp, removeApp} from "./VueComponentModel";

window.Vue = Vue;

export function createViewContext(view) {
    return {
        getModelById(modelId) {
            return view.model.widget_manager.get_model(modelId);
        },
        /* TODO: refactor to abstract the direct use of WidgetView away */
        getView() {
            return view;
        },
    };
}

export class VueView extends DOMWidgetView {
    vueComponent() {
        const view = this;
        return {
            provide: {
                viewCtx: createViewContext(view),
            },
            setup: () => {
                view.onSetup();
                return () => vueRender(view.model, view, {});
            },
        };
    }

    vueRender() {
        return Vue.h(this.vueComponent());
    }

    remove() {
        this.vueApp.unmount();
        removeApp(this.vueApp);
        return super.remove();
    }

    render() {
        super.render();
        (async () => {
            const br = this.beforeViewRender();
            await this.displayed;
            await br;

            this.vueApp = Vue.createApp(this.vueComponent());

            addApp(this.vueApp, this.model.widget_manager);
            this.addPlugins(this.vueApp);
            this.vueApp.mount(this.el);
        })()

    }

    addPlugins(vueApp) {
    }

    onSetup() {
    }

    async beforeViewRender() {
    }
}
