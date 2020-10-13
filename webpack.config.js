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

const electronTypeTarget = {
  mode: "production",
  entry: `./js/index.ts`,
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
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
          include: [
              path.resolve(__dirname, 'js')
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
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
  },  
  devtool: 'source-map',
};

module.exports = [ electronTypeTarget ];