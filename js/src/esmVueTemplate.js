import * as Vue from 'vue'
import { parse } from 'vue/compiler-sfc'

window.esmsInitOptions = { shimMode: true };

export async function compileSfc(sfcStr, mixin) {
    await init()
    const { descriptor: {script, template, styles} } = parse(sfcStr);

    styles && styles.forEach(({content, attrs}) => {
        const prefixedCssId = attrs.id && `ipyvue-${attrs.id}`;
        let style = prefixedCssId && document.getElementById(prefixedCssId);
        if (!style) {
            style = document.createElement('style');
            if (prefixedCssId) {
                style.id = prefixedCssId;
            }
            document.head.appendChild(style);
        }
        if (style.innerHTML !== content) {
            style.innerHTML = content;
        }
    });

    return {
        ...(template && {render: Vue.compile(template.content)}),
        mixins: [script ? (await toModule(script.content)).default : {}, mixin],
    };
}

export function getAsyncComponent(sfcStr, mixin) {
    return Vue.defineAsyncComponent(() => compileSfc(sfcStr, mixin));
}

let _init_promise = null;
async function init() {
    if (!_init_promise) {
        _init_promise = (async () => {
            await loadShim();
            importShim.addImportMap({
                "imports": {
                    "vue": expose(Vue),
                    // "canvas-confetti@1": "https://esm.sh/canvas-confetti@1"
                    // ...importMapWidget["imports"]
                },
                // "scopes": importMapWidget["scopes"]
            });
        })();
    }
    return _init_promise;
}

/* pre-load */
init();

async function loadShim() {
    if (document.querySelectorAll("script[src*=es-module-shims][type=module]").length) {
        console.log("shim was already loadedLoaded");
        return;
    }
    return loadScript("module", "https://ga.jspm.io/npm:es-module-shims@1.7.0/dist/es-module-shims.js")
}

async function loadScript(type, src) {
    return new Promise((onload, onerror) => {
        document.head.appendChild(
            Object.assign(
                document.createElement("script"),
                {type, src, onload, onerror, defer: true }))
    })
}

function expose(module) {
    const id = "_ipyvue2_" + (Math.random()).toString(36);
    window[id] = module;
    const names = Object.keys(module).join(", ")
    return toModuleUrl(`
        const { ${names} } = window["${id}"];
        export default window["${id}"].default;
        delete window["${id}"];
        export { ${names} };`)
}

function toModule(code) {
    return importShim(toModuleUrl(code));
}

function toModuleUrl(code) {
    return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
}
