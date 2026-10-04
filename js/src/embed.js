// Entry point for the unpkg bundle containing custom model definitions.
//
// It differs from the notebook bundle in that it may load some css that would
// already be loaded by the notebook otherwise.

// Lazy chunks load from the folder of this file (the CDN), see publicPath.js.
import './publicPath';

// Export widget models and views, and the npm package version number.
export * from './index';
