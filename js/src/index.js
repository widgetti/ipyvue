import { addCompiler } from '@mariobuikhuizen/vue-compiler-addon';
import Vue from 'vue';

addCompiler(Vue);

export { Vue };
export { VueModel } from './VueModel';
export { VueTemplateModel } from './VueTemplateModel';
export { VueView } from './VueView';
export { HtmlModel } from './Html';
export { ForceLoadModel } from './ForceLoad';
export { vueRender } from './VueRenderer';

export const { version } = require('../package.json'); // eslint-disable-line global-require
