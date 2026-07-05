import Vue from 'vue';
import esModuleShims from './es-module-shims-txt';

window.esmsInitOptions = { shimMode: true };

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
const providedModules = {};
const moduleResolvers = {};

export function provideModule(name, module) {
    if (moduleResolvers[name]) {
        moduleResolvers[name].resolve(module);
        delete moduleResolvers[name];
    } else {
        providedModules[name] = Promise.resolve(module);
    }
}

export function requestModule(name) {
    if (!providedModules[name]) {
        providedModules[name] = new Promise((resolve, reject) => {
            moduleResolvers[name] = { resolve, reject };
        });
    }
    return providedModules[name];
}

export function invalidateModule(name) {
    /* next requestModule waits for a fresh provideModule (hot reload) */
    delete providedModules[name];
    delete moduleResolvers[name];
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

async function importModule(url, name) {
    await init();
    /* another library may have replaced the importShim global since init */
    addVueImportMap();
    const module = await importShim(url);
    try {
        importShim.addImportMap({ imports: { [name]: url } });
    } catch (e) {
        console.warn(`ipyvue: could not (re)map import "${name}"`, e);
    }
    return module;
}

export function loadModuleFromUrl(url, name) {
    return importModule(url, name);
}

export function loadModuleFromCode(code, name) {
    const withSource = /\/\/#\s*sourceURL\s*=/i.test(code)
        ? code : `${code}\n//# sourceURL=ipyvue-module:///${encodeURI(name)}.mjs`;
    return importModule(toModuleUrl(withSource), name);
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
