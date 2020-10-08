const path = require('path');
const fs = require('fs');
const webpack = require('webpack');

const electronTarget = {
  mode: "production",
  entry: `./js/index.js`,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: `bundle.js`
  },
  target: 'electron-main',
  module: {
    rules: [
      {
          test: /\.js$/,
          include: [
              path.resolve(__dirname, 'libs')
          ],            
          use: [
          ],
      },         
      {
          test: /\.(png|svg|jpg|gif)$/,
          include: [
              path.resolve(__dirname, 'images'),
              path.resolve(__dirname, 'css', "images"),
          ],                        
          use: [
            'file-loader',
          ],
      },            
    ]
  },
  devtool: 'source-map',
};

const webTarget = {
  mode: "production",
  entry: `./js/index.js`,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: `bundle-web.js`
  },
  target: 'web',
  module: {
    rules: [
      {
          test: /\.js$/,
          include: [
              path.resolve(__dirname, 'libs')
          ],            
          use: [
          ],
      },         
      {
          test: /\.(png|svg|jpg|gif)$/,
          include: [
              path.resolve(__dirname, 'images'),
              path.resolve(__dirname, 'css', "images"),
          ],                        
          use: [
            'file-loader',
          ],
      },            
    ]
  },
  devtool: 'source-map',
};

module.exports = [ electronTarget, webTarget ];