import * as Vue from 'vue'
import { parse, compileScript, compileStyle, compileTemplate } from 'vue/compiler-sfc'
import esModuleShims from './es-module-shims-txt.js'
import {transform} from "sucrase";

window.esmsInitOptions = { shimMode: true };

function patchCompiledTemplateCode(code) {
    /* Vuetify slot props can contain a Vue ref object in \`ref\`. Passing that through
     * compiler-generated \`v-bind\`/merge helpers breaks Vue's prop normalization in
     * ipyvue's runtime-compiled template path, so we strip only ref-shaped \`ref\` values.
     */
    if (!code.includes('_normalizeProps(_guardReactiveProps(') && !code.includes('_mergeProps(')) {
        return code;
    }

    return [
        `import { isRef as _ipyvueIsRef } from "vue"`,
        `function _ipyvueSanitizeBoundProps(props) {`,
        `    const guarded = typeof _guardReactiveProps === "function" ? _guardReactiveProps(props) : props;`,
        `    if (!guarded || typeof guarded !== "object") {`,
        `        return guarded;`,
        `    }`,
        `    if (_ipyvueIsRef(guarded.ref)) {`,
        `        const { ref, ...rest } = guarded;`,
        `        return rest;`,
        `    }`,
        `    return guarded;`,
        `}`,
        `function _ipyvueMergeProps(...args) {`,
        `    if (!args.length) {`,
        `        return _mergeProps();`,
        `    }`,
        `    return _mergeProps(...args.map((arg) => _ipyvueSanitizeBoundProps(arg)));`,
        `}`,
        code
            .replaceAll('_normalizeProps(_guardReactiveProps(', '_normalizeProps(_ipyvueSanitizeBoundProps(')
            .replaceAll('_mergeProps(', '_ipyvueMergeProps('),
    ].join('\n');
}

function hashSfcId(source) {
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `ipyvue-${(hash >>> 0).toString(36)}`;
}

function syncCompiledStyles(styles, { filename, ownerKey, scopeId }) {
    const styleOwnerId = hashSfcId(String(ownerKey || scopeId));
    const activeStyleIds = new Set();

    styles.forEach(({ content, scoped, lang }, index) => {
        const styleDomId = `ipyvue-style-${styleOwnerId}-${index}`;
        activeStyleIds.add(styleDomId);

        let style = document.getElementById(styleDomId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleDomId;
            style.dataset.ipyvueStyleOwner = styleOwnerId;
            document.head.appendChild(style);
        }

        const compiledStyle = compileStyle({
            filename,
            id: scopeId,
            preprocessLang: lang,
            scoped,
            source: content,
        });
        if (compiledStyle.errors.length) {
            console.warn(compiledStyle.errors);
        }
        if (style.innerHTML !== compiledStyle.code) {
            style.innerHTML = compiledStyle.code;
        }
    });

    document.querySelectorAll(`style[data-ipyvue-style-owner="${styleOwnerId}"]`).forEach((style) => {
        if (!activeStyleIds.has(style.id)) {
            style.remove();
        }
    });
}

export async function compileSfc(sfcStr, mixin, options = {}) {
    await init()
    const parsedTemplate = parse(sfcStr)
    const { descriptor: {script, scriptSetup, template, styles} } = parsedTemplate;
    const hasScopedStyles = styles ? styles.some(({ scoped }) => scoped) : false;
    const scopeId = hashSfcId(sfcStr);
    const filename = `${scopeId}.vue`;

    syncCompiledStyles(styles || [], {
        filename,
        ownerKey: options.styleOwnerKey,
        scopeId,
    });

    if (script) {
        /* For backward compatibility, if module(s).export is used, replace everything before the first { with
         * export default
         */
        if (/modules?\.export.*?{/.test(script.content)) {
            script.content = script.content.replace(/^[^{]+(?={)/, "export default ");
        }
    }
    let compiledScript = (script || scriptSetup) && compileScript(parsedTemplate.descriptor, {id: scopeId});

    const code = compiledScript && (compiledScript.lang === "ts"
        ? transform(compiledScript.content, { transforms: ["typescript"] }).code
        : compiledScript.content);

    let {setup, ...rest} = code ? (await toModule(code)).default : {}

    const compiledTemplate = template && compileTemplate({
        filename,
        id: scopeId,
        scoped: hasScopedStyles,
        source: template.content,
        compilerOptions: {
            bindingMetadata: compiledScript ? compiledScript.bindings : {},
            prefixIdentifiers: true,
        }
    });
    if (compiledTemplate && compiledTemplate.tips.length) {
        console.warn(compiledTemplate.tips);
    }

    const templateCode = compiledTemplate && patchCompiledTemplateCode(compiledTemplate.code);
    const templateModule = templateCode && (await toModule(templateCode));
    return {
        ...(template && templateModule),
        ...(setup && {setup}),
        ...(hasScopedStyles && { __scopeId: `data-v-${scopeId}` }),
        mixins: [rest || {}, mixin],
    };
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
