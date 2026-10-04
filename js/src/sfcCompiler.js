/* The vue-sfc chunk: @vue/compiler-sfc, sucrase and the template compile code.
 * esmVueTemplate.js loads it when the first template compiles.
 */
import { parse, compileScript, compileStyle, compileTemplate } from 'vue/compiler-sfc'
import {transform} from "sucrase";
import { init, toModule } from './esmVueTemplate';

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
