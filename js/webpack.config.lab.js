const webpack = require('webpack');

module.exports = {
  resolve: {
    alias: {
      /* this includes the vue compiler */
      vue$: 'vue/dist/vue.esm-bundler.js',
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
    })
  ],
};
