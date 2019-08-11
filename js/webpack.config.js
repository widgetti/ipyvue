var path = require('path');
var version = require('./package.json').version;

module.exports = [
    {
        entry: './lib/extension.js',
        output: {
            filename: 'extension.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'static'),
            libraryTarget: 'amd'
        },
        mode: 'production',
    },
    {
        entry: './lib/index.js',
        output: {
            filename: 'index.js',
            path: path.resolve(__dirname, '..', 'ipyvue', 'static'),
            libraryTarget: 'amd'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'lodash'],
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
            path: path.resolve(__dirname, '..', 'ipyvue', 'static'),
            libraryTarget: 'amd'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'lodash', 'vue'],
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
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'amd',
            publicPath: 'https://unpkg.com/jupyter-vue@' + version + '/dist/'
        },
        devtool: 'source-map',
        externals: ['@jupyter-widgets/base', 'lodash', 'vue'],
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
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
        externals: ['@jupyter-widgets/base', 'lodash'],
        mode: 'production',
        performance: {
            maxEntrypointSize: 1400000,
            maxAssetSize: 1400000
        },
    },
];
