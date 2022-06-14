const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

/**
 * @type {webpack.Configuration}
 */
const electronTypeTarget = {
    mode: "production", // none' | 'development' | 'production'
    entry: `./packages/index.ts`,
    output: {
        path: path.resolve(__dirname, "renderer", "static", "js"),
        filename: `initial-editor.js`,
    },
    target: "electron-main",
    module: {
        rules: [
            // {
            //     test: /\.js$/,
            //     include: [path.resolve(__dirname, "libs")],
            //     use: [],
            // },
            {
                test: /\.ts$/,
                use: {
                    loader: "ts-loader",
                    options: {
                        configFile: "../tsconfig.build.json",
                    },
                },
                exclude: /node_modules/,
                include: [path.resolve(__dirname, "packages")],
            },
            {
                test: /\.(png|svg|jpg|gif)$/,
                include: [
                    path.resolve(__dirname, "images"),
                    path.resolve(__dirname, "css", "images"),
                ],
                use: ["file-loader"],
            },
            {
                test: /\.js$/,
                loader: "babel-loader",
            },
            // this will apply to both plain `.css` files
            // AND `<style>` blocks in `.vue` files
        ],
    },
    plugins: [
        // make sure to include the plugin for the magic
    ],
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
};

module.exports = [electronTypeTarget];
