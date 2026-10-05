import Vue from 'vue';
import esModuleShims from './es-module-shims-txt';

/* es-module-shims reads this global once, and there is only one shim per page
 * (see init below), so merge instead of overwrite: ipyreact needs mapOverrides
 * to re-point an import map entry on hot reload, and so do we. */
window.esmsInitOptions = { ...window.esmsInitOptions, shimMode: true, mapOverrides: true };

/* Roots created by VueView: re-rendered when a module plugin registers
 * components after they already rendered (unknown tags resolve on the
 * next render in vue2). */
const rootInstances = new Set();

export function trackRootInstance(vm) {
    rootInstances.add(vm);
}

export function untrackRootInstance(vm) {
    rootInstances.delete(vm);
}

function forceUpdateTree(vm) {
    vm.$forceUpdate();
    (vm.$children || []).forEach(forceUpdateTree);
}

export function forceUpdateRoots() {
    /* re-render everything: components that rendered a tag before its module
     * registered it resolve the real component on their next render */
    rootInstances.forEach(forceUpdateTree);
}

/* Named-module registry (mirrors the vue3 branch): Module widgets provide
 * modules by name; consumers await them, so load order does not matter. */
const providedModules = new Map();
const moduleResolvers = new Map();
const loadedModules = new Map();

export function provideModule(name, module) {
    loadedModules.set(name, module);
    if (moduleResolvers.has(name)) {
        moduleResolvers.get(name).resolve(module);
        moduleResolvers.delete(name);
    }
    providedModules.set(name, Promise.resolve(module));
}

/* The module when already loaded, undefined otherwise: consumers that can
 * render synchronously should, an async component factory is only a
 * fallback (vue2 cannot re-render it under a cached vnode). */
export function getLoadedModule(name) {
    return loadedModules.get(name);
}

export function requestModule(name) {
    if (!providedModules.has(name)) {
        providedModules.set(name, new Promise((resolve, reject) => {
            moduleResolvers.set(name, { resolve, reject });
        }));
    }
    return providedModules.get(name);
}

export function invalidateModule(name) {
    /* Keep an existing waiter attached to the next provideModule call. */
    if (!moduleResolvers.has(name)) {
        providedModules.delete(name);
    }
    loadedModules.delete(name);
}

function isCurrent(shouldContinue) {
    return !shouldContinue || shouldContinue();
}

function assertCurrent(shouldContinue) {
    if (!isCurrent(shouldContinue)) {
        throw new Error('stale module load');
    }
}

async function guardedAwait(promise, shouldContinue) {
    const value = await promise;
    assertCurrent(shouldContinue);
    return value;
}

async function guardedWait(promise, shouldContinue) {
    await promise;
    assertCurrent(shouldContinue);
}

export function isStaleModuleLoad(error) {
    return error && error.message === 'stale module load';
}

function addNamedImportMap(name, url) {
    try {
        importShim.addImportMap({ imports: { [name]: url } });
    } catch (e) {
        console.warn(`ipyvue: could not (re)map import "${name}"`, e);
    }
}

async function importModule(url, name, shouldContinue) {
    await guardedWait(init(), shouldContinue);
    /* another library may have replaced the importShim global since init */
    addVueImportMap();
    const module = await guardedAwait(importShim(url), shouldContinue);
    addNamedImportMap(name, url);
    return module;
}

export function loadModuleFromUrl(url, name, shouldContinue) {
    return importModule(url, name, shouldContinue);
}

export function loadModuleFromCode(code, name, shouldContinue) {
    const withSource = /\/\/#\s*sourceURL\s*=/i.test(code)
        ? code : `${code}\n//# sourceURL=ipyvue-module:///${encodeURI(name)}.mjs`;
    return importModule(toModuleUrl(withSource), name, shouldContinue);
}

/* An ES module export used as a component: vue2 supports async component
 * factories, so the module does not need to be loaded yet. */
export function getEsmComponent(moduleName, exportName) {
    return () => requestModule(moduleName).then((module) => {
        if (module instanceof Error) {
            throw module;
        }
        const component = module[exportName || 'default'];
        if (!component) {
            throw new Error(`Module "${moduleName}" has no export "${exportName || 'default'}"`);
        }
        return component;
    });
}

function toModuleUrl(code) {
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}

let vueModuleUrl = null;

function exposeVue() {
    if (!vueModuleUrl) {
        const id = `_ipyvue_${Math.random().toString(36)}`;
        window[id] = Vue;
        const RESERVED = ['delete', 'set', 'default'];
        const names = Object.keys(Vue).filter(n => /^[a-z_$][\w$]*$/i.test(n) && !RESERVED.includes(n));
        /* vue2's module shape: the constructor is the default export */
        vueModuleUrl = toModuleUrl(`
            const Vue = window["${id}"];
            export default Vue;
            export const { ${names.join(', ')} } = Vue;`);
    }
    return vueModuleUrl;
}

function addVueImportMap() {
    importShim.addImportMap({ imports: { vue: exposeVue() } });
}

let initPromise = null;

function init() {
    if (!initPromise) {
        initPromise = (async () => {
            if (!window.importShim) {
                /* the script tag is the cross-library mutex: the check and
                 * the append below run synchronously, so exactly one library
                 * injects the shim (executed globally, not per bundle) */
                const loaded = document.querySelectorAll('script[src*=es-module-shims][type=module]').length
                    || document.getElementById('es-module-shims');
                if (loaded) {
                    while (!window.importShim) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                } else {
                    await new Promise((onload, onerror) => {
                        document.head.appendChild(Object.assign(document.createElement('script'), {
                            type: 'module', src: toModuleUrl(esModuleShims), onload, onerror, id: 'es-module-shims',
                        }));
                    });
                }
            }
            addVueImportMap();
        })();
    }
    return initPromise;
}
