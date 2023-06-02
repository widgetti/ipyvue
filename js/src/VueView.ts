import { DOMWidgetView } from '@jupyter-widgets/base';
import Vue from 'vue';
import { vueRender } from './VueRenderer';

export function createViewContext(view : VueView) {
    return {
        getModelById(modelId: string) {
            return view.model.widget_manager.get_model(modelId);
        },
        /* TODO: refactor to abstract the direct use of WidgetView away */
        getView() {
            return view;
        },
    };
}

export class VueView extends DOMWidgetView {
    vueApp: any;
    remove() {
        this.vueApp.$destroy();
        return super.remove();
    }

    render() {
        super.render();
        this.displayed.then(() => {
            const vueEl = document.createElement('div');
            this.el.appendChild(vueEl);

            this.vueApp = new Vue({
                el: vueEl,
                provide: {
                    viewCtx: createViewContext(this),
                },
                render: createElement => vueRender(createElement, this.model, this, {}),
            });
        });
    }
}
