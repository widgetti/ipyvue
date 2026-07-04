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

function normalizeOptionsScript(scriptContent) {
    const commonJsAssignment = /modules?\.exports?\s*=/;
    const commonJsMatch = commonJsAssignment.exec(scriptContent);
    if (commonJsMatch) {
        return `export default ${scriptContent.slice(commonJsMatch.index + commonJsMatch[0].length)}`;
    }

    if (!/\b(import|export)\b/.test(scriptContent)) {
        const optionsStart = scriptContent.indexOf('{');
        if (optionsStart !== -1) {
            return `export default ${scriptContent.slice(optionsStart)}`;
        }
    }

    return scriptContent;
}

function normalizeClassicScriptsInSfc(sfcStr) {
    return sfcStr.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
        if (/\bsetup\b/.test(attrs)) {
            return match;
        }
        return `<script${attrs}>${normalizeOptionsScript(content)}</script>`;
    });
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
    const scopeId = hashSfcId(sfcStr);
    const sourceURL = options.sourceURL || options.filename || `${scopeId}.vue`;
    const filename = options.filename || sourceURL;
    const parsedTemplate = parse(normalizeClassicScriptsInSfc(sfcStr))
    const { descriptor: {script, scriptSetup, template, styles} } = parsedTemplate;
    const hasScopedStyles = styles ? styles.some(({ scoped }) => scoped) : false;

    syncCompiledStyles(styles || [], {
        filename,
        ownerKey: options.styleOwnerKey,
        scopeId,
    });

    let compiledScript = (script || scriptSetup) && compileScript(parsedTemplate.descriptor, {id: scopeId});

    const code = compiledScript && (compiledScript.lang === "ts"
        ? transform(compiledScript.content, { transforms: ["typescript"] }).code
        : compiledScript.content);

    let {setup, ...rest} = code ? (await toModule(code, `${sourceURL}?script`)).default : {}

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
    const templateModule = templateCode && (await toModule(templateCode, `${sourceURL}?template`));
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

/* Named-module registry (mirrors ipyreact): ModuleModel widgets provide
 * modules by name; consumers await them, so load order does not matter. */
const _providedModules = {};
const _moduleResolvers = {};

export function provideModule(name, module) {
    if (_moduleResolvers[name]) {
        _moduleResolvers[name].resolve(module);
        delete _moduleResolvers[name];
    } else {
        _providedModules[name] = Promise.resolve(module);
    }
}

export function requestModule(name) {
    if (!_providedModules[name]) {
        _providedModules[name] = new Promise((resolve, reject) => {
            _moduleResolvers[name] = { resolve, reject };
        });
    }
    return _providedModules[name];
}

export function invalidateModule(name) {
    /* next requestModule waits for a fresh provideModule (hot reload) */
    delete _providedModules[name];
    delete _moduleResolvers[name];
}

export async function loadModuleFromCode(code, name) {
    await init();
    /* another library (e.g. ipyreact) may have replaced the importShim
     * global since init; re-add the vue mapping so this import resolves
     * against the shim that will actually run it (same refresh toModule
     * does for compiled SFCs) */
    addVueImportMap();
    const url = toModuleUrl(withSourceURL(code, `ipyvue-module:///${name}.mjs`));
    const module = await importShim(url);
    /* Also expose under the name for inter-module imports. Import maps
     * cannot remap an already-resolved specifier (hot reload in the same
     * page); the named-module registry is the source of truth, so a failed
     * remap only means inter-module imports keep the previous version. */
    try {
        importShim.addImportMap({ imports: { [name]: url } });
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
export function getEsmAsyncComponent(moduleName, exportName, mixin) {
    return Vue.defineAsyncComponent(async () => {
        const component = await resolveModuleExport(moduleName, exportName);
        const { render, setup, __scopeId, ...rest } = component;
        return {
            ...(render && { render }),
            ...(setup && { setup }),
            ...(__scopeId && { __scopeId }),
            mixins: [rest, mixin],
        };
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

async function init() {
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

function toModule(code, sourceURL) {
    // Solara may update the import map after ipyvue initialized. Compiled SFC
    // blobs import "vue", so refresh this entry before importing each module.
    addVueImportMap();
    return importShim(toModuleUrl(withSourceURL(code, sourceURL)));
}

function toModuleUrl(code) {
    return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
}
