import * as Vue from 'vue'
import esModuleShims from './es-module-shims-txt.js'

/* es-module-shims reads this global once, and there is only one shim per page
 * (see loadShim below), so merge instead of overwrite: ipyreact needs
 * mapOverrides to re-point an import map entry on hot reload, and so do we. */
window.esmsInitOptions = { ...window.esmsInitOptions, shimMode: true, mapOverrides: true };

/* @vue/compiler-sfc and sucrase are large, so they are in the vue-sfc chunk
 * (sfcCompiler.js), which loads when the first template compiles. Hosts can preload
 * it, see webpack.config.js.
 */
let sfcCompilerPromise = null;

function loadSfcCompiler(sourceURL) {
    if (!sfcCompilerPromise) {
        // hosts listen to this, for instance to tell the user how to preload the chunk
        window.dispatchEvent(new CustomEvent('jupyter-vue:load-chunk', {
            detail: { chunk: 'vue-sfc', sourceURL },
        }));
        sfcCompilerPromise = import(/* webpackChunkName: "vue-sfc" */ './sfcCompiler')
            .catch((error) => {
                // let a later template try again
                sfcCompilerPromise = null;
                throw error;
            });
    }
    return sfcCompilerPromise;
}

export async function compileSfc(sfcStr, mixin, options = {}) {
    const sfcCompiler = await loadSfcCompiler(options.sourceURL || options.filename);
    return sfcCompiler.compileSfc(sfcStr, mixin, options);
}

export function getAsyncComponent(sfcStr, mixin, options = {}) {
    return Vue.defineAsyncComponent(() => compileSfc(sfcStr, mixin, options));
}

export async function addModule(name, module) {
    await init();
    importShim.addImportMap({
        "imports": {
            [name]: expose(module),
        }
    })
}

/* Named-module registry (mirrors ipyreact): ModuleModel widgets provide
 * modules by name; consumers await them, so load order does not matter. */
const _providedModules = new Map();
const _moduleResolvers = new Map();
const _providedModuleNames = new Set();

export function provideModule(name, module) {
    const resolver = _moduleResolvers.get(name);
    const replacedModule = _providedModuleNames.has(name);
    _providedModules.set(name, Promise.resolve(module));
    _providedModuleNames.add(name);
    if (resolver) {
        resolver.resolve(module);
        _moduleResolvers.delete(name);
    }
    return replacedModule;
}

export function requestModule(name) {
    if (!_providedModules.has(name)) {
        _providedModules.set(name, new Promise((resolve, reject) => {
            _moduleResolvers.set(name, { resolve, reject });
        }));
    }
    return _providedModules.get(name);
}

export function invalidateModule(name) {
    /* Keep a pending waiter alive so the next provideModule resolves it. */
    if (!_moduleResolvers.has(name)) {
        _providedModules.delete(name);
    }
}

/* Imports a module from a url, or from code when url is empty. Returns
 * undefined when isCurrent() turns false, so a stale load cannot remap the name. */
export async function loadModule(name, url, code, isCurrent) {
    await init();
    /* another library (e.g. ipyreact) may have replaced the importShim
     * global since init; re-add the vue mapping so this import resolves
     * against the shim that will actually run it (same refresh toModule
     * does for compiled SFCs) */
    addVueImportMap();
    const moduleUrl = url || toModuleUrl(withSourceURL(code, `ipyvue-module:///${name}.mjs`));
    const module = await importShim(moduleUrl);
    if (!isCurrent()) {
        return undefined;
    }
    /* Also expose under the name for inter-module imports. Import maps
     * cannot remap an already-resolved specifier (hot reload in the same
     * page); the named-module registry is the source of truth, so a failed
     * remap only means inter-module imports keep the previous version. */
    try {
        importShim.addImportMap({ imports: { [name]: moduleUrl } });
    } catch (e) {
        console.warn(`ipyvue: could not (re)map import "${name}" (stale inter-module imports until page reload)`, e);
    }
    return module;
}

async function resolveModuleExport(moduleName, exportName) {
    const module = await requestModule(moduleName);
    if (module instanceof Error) {
        /* ModuleModel provides its load error so consumers fail visibly */
        throw module;
    }
    const component = module[exportName || 'default'];
    if (!component) {
        throw new Error(`Module "${moduleName}" has no export "${exportName || 'default'}"`);
    }
    return component;
}

/* Component whose implementation comes from a precompiled ES module instead
 * of an in-browser compiled SFC. Mirrors compileSfc's output shape: the
 * component's own options ride as mixins[0] so the ipyvue model mixin
 * (mixins[1], providing the Python traits as data and the event methods)
 * takes precedence over the component's own data() placeholders. */
export function getEsmAsyncComponent(moduleName, exportName, mixin, placeholder) {
    return Vue.defineAsyncComponent({
        loader: async () => {
            const component = await resolveModuleExport(moduleName, exportName);
            const { render, setup, __scopeId, ...rest } = component;
            return {
                ...(render && { render }),
                ...(setup && { setup }),
                ...(__scopeId && { __scopeId }),
                mixins: [rest, mixin],
            };
        },
        loadingComponent: placeholder,
        errorComponent: placeholder,
        delay: 0,
    });
}

/* An ES module export used directly as a component (a tag inside another
 * template): no model mixin, the component keeps its own props/emits. */
export function getEsmComponent(moduleName, exportName) {
    return Vue.defineAsyncComponent(() => resolveModuleExport(moduleName, exportName));
}

let _init_promise = null;
let _vue_module_url = null;
function vueModuleUrl() {
    if (!_vue_module_url) {
        _vue_module_url = expose(Vue);
    }
    return _vue_module_url;
}

function addVueImportMap() {
    importShim.addImportMap({
        "imports": {
            "vue": vueModuleUrl(),
        },
    });
}

export async function init() {
    if (!_init_promise) {
        _init_promise = (async () => {
            await loadShim();
            addVueImportMap();
        })();
    }
    return _init_promise;
}

/* pre-load */
init();

async function loadShim() {
    if (window.importShim) {
        return;
    }
    if (document.querySelectorAll("script[src*=es-module-shims][type=module]").length || document.getElementById("es-module-shims")) {
        /* another library is loading it; wait for its copy */
        while (!window.importShim) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return;
    }
    return loadScript("module", toModuleUrl(esModuleShims), "es-module-shims")
}

async function loadScript(type, src, id) {
    return new Promise((onload, onerror) => {
        document.head.appendChild(
            Object.assign(
                document.createElement("script"),
                {type, src, onload, onerror, defer: true, ...id && { id } }))
    })
}

function expose(module) {
    const id = "_ipyvue2_" + (Math.random()).toString(36);
    window[id] = module;
    const names = Object.keys(module).join(", ")
    /* no delete of the global: the blob can be evaluated more than once
     * (import-map updates, or a second es-module-shims instance loaded by
     * another library), and each evaluation reads it */
    return toModuleUrl(`
        const { ${names} } = window["${id}"];
        export default window["${id}"].default;
        export { ${names} };`)
}

function hasSourceURL(code) {
    return /\/\/#\s*sourceURL\s*=/i.test(code);
}

function withSourceURL(code, sourceURL) {
    if (!sourceURL || hasSourceURL(code)) {
        return code;
    }
    return `${code}\n//# sourceURL=${normalizeSourceURL(sourceURL)}`;
}

function normalizeSourceURL(sourceURL) {
    try {
        new URL(sourceURL);
        return sourceURL;
    } catch (error) {
        return `ipyvue:///${encodeURI(sourceURL).replace(/#/g, '%23')}`;
    }
}

export function toModule(code, sourceURL) {
    // Solara may update the import map after ipyvue initialized. Compiled SFC
    // blobs import "vue", so refresh this entry before importing each module.
    addVueImportMap();
    return importShim(toModuleUrl(withSourceURL(code, sourceURL)));
}

function toModuleUrl(code) {
    return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
}
