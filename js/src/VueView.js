import { DOMWidgetView } from '@jupyter-widgets/base';
import Vue from 'vue';
import { vueRender } from './VueRenderer';

export class VueView extends DOMWidgetView {
    remove() {
        this.vueApp.$destroy();
        return super.remove();
    }

    render() {
        super.render();

        const vueEl = document.createElement('div');
        this.el.appendChild(vueEl);

        this.vueApp = new Vue({
            el: vueEl,
            render: createElement => vueRender(createElement, this.model, this, {}),
        });
    }
}
