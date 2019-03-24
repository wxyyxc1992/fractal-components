const path = require('path');
const merge = require('webpack-merge');

const devConfig = require('../../../../scripts/webpack/webpack.config.dev');

module.exports = merge(devConfig, {
  entry: {
    mirror: path.resolve(__dirname, '../../example/mirror/index.ts'),
    whiteboard: path.resolve(__dirname, '../../example/whiteboard/index.ts')
  },
  devServer: {
    contentBase: path.resolve(__dirname, '../../public')
  },
  resolve: {
    alias: {
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom')
    }
  }
});
