import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'
import esModuleShims from './es-module-shims-txt.js'
import {transform} from "sucrase";

window.esmsInitOptions = { shimMode: true };

export async function compileSfc(sfcStr, mixin) {
    await init()
    const parsedTemplate = parse(sfcStr)
    const { descriptor: {script, scriptSetup, template, styles} } = parsedTemplate;

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

    if (script) {
        /* For backward compatibility, if module(s).export is used, replace everything before the first { with
         * export default
         */
        if (/modules?\.export.*?{/.test(script.content)) {
            script.content = script.content.replace(/^[^{]+(?={)/, "export default ");
        }
    }
    let compiledScript = (script || scriptSetup) && compileScript(parsedTemplate.descriptor, {id: "abc"});

    const code = compiledScript && (compiledScript.lang === "ts"
        ? transform(compiledScript.content, { transforms: ["typescript"] }).code
        : compiledScript.content);

    let {setup, ...rest} = code ? (await toModule(code)).default : {}

    const compiledTemplate = template && compileTemplate({
        source: template.content,
        compilerOptions: {
            bindingMetadata: compiledScript ? compiledScript.bindings : {},
            prefixIdentifiers: true,
        }
    });
    if (compiledTemplate && compiledTemplate.tips.length) {
        console.warn(compiledTemplate.tips);
    }

    const templateModule = compiledTemplate && (await toModule(compiledTemplate.code))
    return {
        ...(template && templateModule),
        ...(setup && {setup}),
        mixins: [rest || {}, mixin],
    };
}

export function getAsyncComponent(sfcStr, mixin) {
    return Vue.defineAsyncComponent(() => compileSfc(sfcStr, mixin));
}

export async function addModule(name, module) {
    await init();
    importShim.addImportMap({
        "imports": {
            [name]: expose(module),
        }
    })
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
    if (document.querySelectorAll("script[src*=es-module-shims][type=module]").length || document.getElementById("es-module-shims")) {
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
