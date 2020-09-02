const path = require("path");
const webpack = require("webpack");

const { version = "0.0.0" } = require("./package.json");

// small hack to inject dynamic values to environment variables at build time
process.env.VUE_APP_VERSION = version;

module.exports = {
  configureWebpack: () => {
    const config = {
      resolve: {
        alias: {
          vue$: "vue/dist/vue.esm.js",
          "@": path.resolve(__dirname, "src/")
        }
      },

      plugins: [
        new webpack.ProvidePlugin({
          webix: path.join(
            __dirname,
            "node_modules",
            "@xbs",
            "webix-pro",
            "webix.js"
          )
        })
      ]
    };
    return config;
  },

  css: {
    loaderOptions: {
      scss: {
        prependData: '@import "~@/assets/scss/abstracts/variables.scss";'
      }
    }
  },

  pluginOptions: {
    i18n: {
      locale: "en",
      fallbackLocale: "en",
      localeDir: "locales",
      enableInSFC: true
    }
  },

  devServer: {
    watchOptions: {
      ignored: /node_modules/,
      aggregateTimeout: 300,
      poll: 500
    },
    disableHostCheck: true
  },

  chainWebpack: config => {
    config.module
      .rule("i18n")
      .resourceQuery(/blockType=i18n/)
      .type("javascript/auto")
      .use("i18n")
      .loader("@kazupon/vue-i18n-loader")
      .end()
      .end();

    config.amd(false);
  }
};
