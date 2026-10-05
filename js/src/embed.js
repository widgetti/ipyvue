// Entry point for the AMD bundles containing custom model definitions: the
// classic notebook extension (nbextension/index.js) and the unpkg bundle (dist/index.js).

// Lazy chunks load from the folder of this file, see publicPath.js.
import './publicPath';

// Export widget models and views, and the npm package version number.
export * from './index';
