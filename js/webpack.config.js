var path = require('path');
var version = require('./package.json').version;
const webpack = require('webpack');

const plugins = [
    new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
    })
]

const ignoreWarnings = [
    (warning) =>
        warning.message.includes('Critical dependency') &&
        warning.module?.resource?.includes(
            '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
        ),
];

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
        ignoreWarnings,
    },
    {
        entry: './lib/index.js',
        output: {
            filename: 'index.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base'],
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
        ignoreWarnings,
    },
    {
        entry: './lib/nodeps.js',
        output: {
            filename: 'nodeps.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'vue'],
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
        ignoreWarnings,
    },
    {
        entry: './lib/nodeps.js',
        output: {
            filename: 'nodeps.js',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'amd',
            publicPath: 'https://unpkg.com/jupyter-vue@' + version + '/dist/'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'vue'],
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
        ignoreWarnings,
    },
    {
        entry: './lib/embed.js',
        output: {
            filename: 'index.js',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'amd',
            publicPath: 'https://unpkg.com/jupyter-vue@' + version + '/dist/'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base'],
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
        ignoreWarnings,
    },
];
