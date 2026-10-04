/* AMD builds only (nbextension index.js and nodeps.js, and dist/ on a CDN): load the
 * vue-sfc chunk from the folder of the file requirejs loaded. requirejs runs the factory
 * after the script tag finished, so webpack cannot use document.currentScript.
 * The chunk url keeps the query of that file (the cache-busting hash of Solara or the
 * notebook).
 */
import amdModule from 'module';

if (amdModule && amdModule.uri) {
    const [base, query] = amdModule.uri.split('?');
    __webpack_public_path__ = base.replace(/[^/]*$/, ''); // eslint-disable-line no-undef
    if (query) {
        const scriptFilename = __webpack_get_script_filename__; // eslint-disable-line no-undef, camelcase
        // eslint-disable-next-line no-undef, camelcase
        __webpack_get_script_filename__ = (chunkId) => `${scriptFilename(chunkId)}?${query}`;
    }
}
