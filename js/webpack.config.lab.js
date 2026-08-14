const rspack = require('@rspack/core');

module.exports = {
  resolve: {
    alias: {
      /* this includes the vue compiler */
      vue$: 'vue/dist/vue.esm-bundler.js',
    },
  },
  plugins: [
    new rspack.DefinePlugin({
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
    })
  ],
  ignoreWarnings: [
    (warning) =>
      warning.message.includes('Critical dependency') &&
      warning.module?.resource?.includes(
        '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
      ),
  ],
  performance: {
    maxAssetSize: 800_000,
  },
};
