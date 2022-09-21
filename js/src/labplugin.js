const base = require('@jupyter-widgets/base');
const jupyterVue = require('./index');

module.exports = {
    id: 'jupyter-vue',
    requires: [base.IJupyterWidgetRegistry],
    activate(app, widgets) {
        window.jupyterVue = jupyterVue;
        widgets.registerWidget({
            name: 'jupyter-vue',
            version: jupyterVue.version,
            exports: jupyterVue,
        });
    },
    autoStart: true,
};
