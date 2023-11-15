export * from './VueWithCompiler';
export { VueModel } from './VueModel';
export { VueTemplateModel } from './VueTemplateModel';
export { VueView, createViewContext } from './VueView';
export { HtmlModel } from './Html';
export { TemplateModel } from './Template';
export { ForceLoadModel } from './ForceLoad';
export { vueRender } from './VueRenderer';
export { VueComponentModel } from './VueComponentModel';
export { getAsyncComponent, addModule } from './esmVueTemplate';

export const { version } = require('../package.json'); // eslint-disable-line global-require
