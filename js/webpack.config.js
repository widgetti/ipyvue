var path = require('path');
var version = require('./package.json').version;

module.exports = [
    {
        entry: './lib/extension.js',
        output: {
            filename: 'extension.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd'
        },
        mode: 'production',
    },
    {
        entry: './lib/index.js',
        output: {
            filename: 'index.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd',
            devtoolModuleFilenameTemplate: `webpack://jupyter-widgets/jupyter-vue/[resource-path]?[loaders]`,
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base'],
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
    },
    {
        entry: './lib/nodeps.js',
        output: {
            filename: 'nodeps.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'nbextension'),
            libraryTarget: 'amd',
            devtoolModuleFilenameTemplate: `webpack://jupyter-widgets/jupyter-vue/[resource-path]?[loaders]`,
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'vue'],
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
        resolve: {
            alias: { './VueWithCompiler$': path.resolve(__dirname, 'lib/nodepsVueWithCompiler.js') },
        },
    },
    {
        entry: './lib/nodeps.js',
        output: {
            filename: 'nodeps.js',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'amd',
            publicPath: 'https://unpkg.com/jupyter-vue@' + version + '/dist/',
            devtoolModuleFilenameTemplate: `webpack://jupyter-widgets/jupyter-vue/[resource-path]?[loaders]`,
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'vue'],
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
        resolve: {
            alias: { './VueWithCompiler$': path.resolve(__dirname, 'lib/nodepsVueWithCompiler.js') },
        },
    },
    {
        entry: './lib/embed.js',
        output: {
            filename: 'index.js',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'amd',
            publicPath: 'https://unpkg.com/jupyter-vue@' + version + '/dist/',
            devtoolModuleFilenameTemplate: `webpack://jupyter-widgets/jupyter-vue/[resource-path]?[loaders]`,
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base'],
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
    },
];
