var path = require('path');
var version = require('./package.json').version;
const webpack = require('webpack');

const plugins = [
    new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
    })
]

/* The vue-sfc chunk (see src/esmVueTemplate.js) gets one file with a stable name, so a
 * host can preload it: Solara adds
 * <script src=".../jupyter-vue/nodeps-vue-sfc.js" data-webpack="jupyter-vue-nodeps:chunk-vue-sfc"
 *         onerror="event.target.remove()">.
 * webpack reuses a tag with that src or data-webpack, also one that already failed, and then
 * waits 120 s for it; onerror removes a failed tag, so webpack adds a new one.
 * The vue-sfc-ts chunk (sucrase, see src/sfcCompiler.js) has a stable name in the same way:
 * nodeps-vue-sfc-ts.js and index-vue-sfc-ts.js.
 * index.js and nodeps.js share a folder, so each has its own chunk file name and its
 * own uniqueName (chunk loading global): a chunk must not install into the other runtime.
 * The nbextension builds set a static publicPath, which src/publicPath.js replaces. With
 * webpack's 'auto' publicPath, they scan the page's <script> tags at load, which can throw.
 */
const optimization = {
    chunkIds: 'named',
    splitChunks: false,
};

module.exports = [
    {
        entry: './lib/extension.js',
        output: {
            filename: 'extension.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd'
        },
        mode: 'production',
        plugins,
    },
    {
        entry: './lib/embed.js',
        output: {
            filename: 'index.js',
            chunkFilename: 'index-[name].js',
            uniqueName: 'jupyter-vue-index',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd',
            publicPath: '',
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'module'],
        optimization,
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
        resolve: {
            alias: {
                vue$: 'vue/dist/vue.esm-bundler.js',
            },
        },
        plugins,
    },
    {
        entry: './lib/nodeps.js',
        output: {
            filename: 'nodeps.js',
            chunkFilename: 'nodeps-[name].js',
            uniqueName: 'jupyter-vue-nodeps',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd',
            publicPath: '',
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'vue', 'module'],
        optimization,
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
        resolve: {
            alias: {
                vue$: 'vue/dist/vue.esm-bundler.js',
            },
        },
        plugins,
    },
    {
        entry: './lib/nodeps.js',
        output: {
            filename: 'nodeps.js',
            chunkFilename: 'nodeps-[name].js',
            uniqueName: 'jupyter-vue-nodeps',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'amd',
            publicPath: 'https://unpkg.com/jupyter-vue@' + version + '/dist/'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'vue', 'module'],
        optimization,
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
        resolve: {
            alias: {
                vue$: 'vue/dist/vue.esm-bundler.js',
            },
        },
        plugins,
    },
    {
        entry: './lib/embed.js',
        output: {
            filename: 'index.js',
            chunkFilename: 'index-[name].js',
            uniqueName: 'jupyter-vue-index',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'amd',
            publicPath: 'https://unpkg.com/jupyter-vue@' + version + '/dist/'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'module'],
        optimization,
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
        resolve: {
            alias: {
                vue$: 'vue/dist/vue.esm-bundler.js',
            },
        },
        plugins,
    },
];
