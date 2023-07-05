const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

/**
 * @type {webpack.Configuration}
 */
const electronMainTarget = {
    mode: "production", // none' | 'development' | 'production'
    entry: "./main/background.ts",
    output: {
        path: path.resolve(__dirname, "app"),
        filename: "background.js",
    },
    target: "electron-main",
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: "ts-loader",
                    options: {
                        configFile: "../tsconfig.build.json",
                    },
                },
                exclude: /node_modules/,
                include: [path.resolve(__dirname, "main")],
            },
            {
                test: /\.js$/,
                loader: "babel-loader",
            },
        ],
    },
};

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
        ],
    },
    plugins: [
        // make sure to include the plugin for the magic
    ],
    // source-map most detailed at the expense of build speed.
    devtool: "source-map",
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
        alias: {
            "@components": path.resolve(__dirname, "renderer", "components"),
        },
    },
};

module.exports = [electronTypeTarget, electronMainTarget];
