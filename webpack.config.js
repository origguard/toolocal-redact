const path = require('path')

module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  devtool: false,
  entry: {
    'toolocal_redact-main': path.resolve(__dirname, 'src', 'fileaction.js'),
  },
  output: {
    path: path.resolve(__dirname, 'js'),
    filename: '[name].js',
    chunkFilename: '[name].chunk.js',
  },
  module: {
    rules: [
      {
        resourceQuery: /raw/,
        type: 'asset/source',
      },
      {
        test: /pdf\.worker\.min\.js$/,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.mjs', '.json', '.svg'],
    fallback: {
      fs: false,
      path: false,
      crypto: false,
      canvas: false,
      url: false,
      http: false,
      https: false,
      zlib: false,
      stream: false,
      buffer: false,
      string_decoder: false,
    },
  },
  externals: {
    '@nextcloud/axios': 'OC.axios || window.axios',
    '@nextcloud/l10n': 'OC.L10N',
    '@nextcloud/router': 'OC.Router',
  },
}
