var webpack = require('webpack');
const WebpackShellPlugin = require('webpack-shell-plugin');
var path = require('path');
var fs = require('fs');

var nodeModules = {};
fs.readdirSync('node_modules')
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });


  
module.exports = {
  entry: './server.js',
  target: 'node',
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'server.js',
    libraryTarget : "commonjs2"
  },
  externals: nodeModules,
  plugins: [
    new webpack.IgnorePlugin(/\.(css|less)$/),
    new webpack.BannerPlugin('require("source-map-support").install();'),
    new WebpackShellPlugin({
      onBuildEnd: [
        'echo "Transfering files ... "',
        'copy .\\process.env .\\build',
        'copy .\\web.config .\\build',
        'echo "DONE ... "',
      ]
    })
  ],
  devtool: 'sourcemap'
}
