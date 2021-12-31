const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const { VueLoaderPlugin } = require("vue-loader");
const { CheckerPlugin } = require("awesome-typescript-loader");

const port = 3000;
const webpackHotModuleReloadUrl = `webpack-hot-middleware/client?path=http://localhost:${port}/__webpack_hmr`;

const electronTypeTarget = {
    mode: "development", // none' | 'development' | 'production'
    entry: `./packages/index.ts`,
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: `bundle.js`,
    },
    target: "electron-main",
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [path.resolve(__dirname, "libs")],
                use: [],
            },
            {
                test: /\.vue$/,
                loader: "vue-loader",
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                include: [path.resolve(__dirname, "packages")],
                use: "ts-loader",
            },
            // {
            //     test: /\.tsx?$/,
            //     exclude: /node_modules/,
            //     include: [path.resolve(__dirname, "packages")],
            //     use: [
            //         {
            //             loader: "awesome-typescript-loader",
            //             options: {
            //                 useBabel: false,
            //                 useCache: true,
            //             },
            //         },
            //     ],
            // },
            {
                test: /\.node$/,
                loader: "awesome-node-loader",
                options: {
                    name: "[name].[ext]",
                },
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
            {
                test: /\.css$/,
                use: ["vue-style-loader", "css-loader"],
            },
            {
                test: /\.scss$/,
                use: [
                    "vue-style-loader",
                    "css-loader",
                    "sass-loader?sourceMap",
                ],
            },
            {
                test: /\.sass$/,
                use: [
                    "vue-style-loader",
                    "css-loader",
                    "sass-loader?indentedSyntax",
                ],
                include: [path.resolve(__dirname, "css")],
            },
        ],
    },
    plugins: [
        new CheckerPlugin(),
        // make sure to include the plugin for the magic
        new VueLoaderPlugin(),
    ],
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
        alias: {
            vue: "vue/dist/vue.js",
        },
    },
    devtool:
        this.move === "development" ? "eval-cheap-source-map" : "source-map",
};

const electronRendererTypeTarget = {
    mode: "development", // none' | 'development' | 'production'
    entry: `./packages/index.ts`,
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: `bundle.js`,
    },
    target: "electron-renderer",
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [path.resolve(__dirname, "libs")],
                use: [],
            },
            {
                test: /\.vue$/,
                loader: "vue-loader",
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                include: [path.resolve(__dirname, "packages")],
                use: "ts-loader",
            },
            // {
            //     test: /\.tsx?$/,
            //     exclude: /node_modules/,
            //     include: [path.resolve(__dirname, "packages")],
            //     use: [
            //         {
            //             loader: "awesome-typescript-loader",
            //             options: {
            //                 useBabel: false,
            //                 useCache: true,
            //             },
            //         },
            //     ],
            // },
            {
                test: /\.node$/,
                loader: "awesome-node-loader",
                options: {
                    name: "[name].[ext]",
                },
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
            {
                test: /\.css$/,
                use: ["vue-style-loader", "css-loader"],
            },
            {
                test: /\.scss$/,
                use: [
                    "vue-style-loader",
                    "css-loader",
                    "sass-loader?sourceMap",
                ],
            },
            {
                test: /\.sass$/,
                use: [
                    "vue-style-loader",
                    "css-loader",
                    "sass-loader?indentedSyntax",
                ],
                include: [path.resolve(__dirname, "css")],
            },
        ],
    },
    plugins: [
        new CheckerPlugin(),
        // make sure to include the plugin for the magic
        new VueLoaderPlugin(),
    ],
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
        alias: {
            vue: "vue/dist/vue.js",
        },
    },
    devtool:
        this.move === "development" ? "eval-cheap-source-map" : "source-map",
};

module.exports = [electronTypeTarget, electronRendererTypeTarget];
