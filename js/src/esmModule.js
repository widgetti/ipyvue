import Vue from 'vue';
import esModuleShims from './es-module-shims-txt';

/* es-module-shims reads this global once, and there is only one shim per page
 * (see init below), so merge instead of overwrite: ipyreact needs mapOverrides
 * to re-point an import map entry on hot reload, and so do we. */
window.esmsInitOptions = { ...window.esmsInitOptions, shimMode: true, mapOverrides: true };

/* Named-module registry (mirrors the vue3 branch): Module widgets provide
 * modules by name; consumers await them, so load order does not matter. */
const providedModules = new Map();
const moduleResolvers = new Map();
/* The latest provided module per name, in a reactive cell: a render that
 * reads it re-renders when the module is provided again (hot reload). */
const loadedModules = new Map();

function loadedModuleCell(name) {
    if (!loadedModules.has(name)) {
        loadedModules.set(name, Vue.observable({ module: undefined }));
    }
    return loadedModules.get(name);
}

export function provideModule(name, module) {
    loadedModuleCell(name).module = module;
    if (moduleResolvers.has(name)) {
        moduleResolvers.get(name).resolve(module);
        moduleResolvers.delete(name);
    }
    providedModules.set(name, Promise.resolve(module));
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
}

async function importModule(url, name, isCurrent) {
    await init();
    /* another library may have replaced the importShim global since init */
    addVueImportMap();
    const module = await importShim(url);
    /* a stale load must not re-point the name to its old code */
    if (isCurrent()) {
        try {
            importShim.addImportMap({ imports: { [name]: url } });
        } catch (e) {
            console.warn(`ipyvue: could not (re)map import "${name}"`, e);
        }
    }
    return module;
}

export function loadModuleFromUrl(url, name, isCurrent) {
    return importModule(url, name, isCurrent);
}

export function loadModuleFromCode(code, name, isCurrent) {
    const withSource = /\/\/#\s*sourceURL\s*=/i.test(code)
        ? code : `${code}\n//# sourceURL=ipyvue-module:///${encodeURI(name)}.mjs`;
    return importModule(toModuleUrl(withSource), name, isCurrent);
}

/* null until the module is provided, and after a failed load */
export function getModuleExport(moduleName, exportName) {
    const { module } = loadedModuleCell(moduleName);
    if (!module || module instanceof Error) {
        return null;
    }
    const component = module[exportName || 'default'];
    if (!component) {
        console.error(`ipyvue: module "${moduleName}" has no export "${exportName || 'default'}"`);
    }
    return component || null;
}

/* An ES module export used as a tag. Functional, so refs, events and slots
 * reach the export directly; the parent render reads the module, so it
 * renders the tag once the module arrives and again after a reload. */
export function getEsmComponent(moduleName, exportName) {
    return {
        functional: true,
        render(h, { data, children }) {
            const component = getModuleExport(moduleName, exportName);
            return component ? h(component, data, children) : h();
        },
    };
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
