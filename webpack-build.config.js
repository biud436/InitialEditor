const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const { VueLoaderPlugin } = require("vue-loader");

const electronTypeTarget = {
    mode: "development", // none' | 'development' | 'production'
    entry: `./src/main.ts`,
    output: {
        path: path.resolve(__dirname, "src"),
        filename: `index.js`
    },
    target: "electron-main",
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [path.resolve(__dirname, "libs")],
                use: []
            },
            {
                test: /\.ts$/,
                use: {
                    loader: "ts-loader",
                    options: {
                        configFile: "./tsconfig.build.json"
                    }
                },
                exclude: /node_modules/,
                include: [
                    path.resolve(__dirname, "src"),
                    path.resolve(__dirname, "packages")
                ]
            },
            {
                test: /\.(png|svg|jpg|gif)$/,
                include: [
                    path.resolve(__dirname, "images"),
                    path.resolve(__dirname, "css", "images")
                ],
                use: ["file-loader"]
            },
            {
                test: /\.vue$/,
                loader: "vue-loader"
            },
            {
                test: /\.js$/,
                loader: "babel-loader"
            },
            // this will apply to both plain `.css` files
            // AND `<style>` blocks in `.vue` files
            {
                test: /\.css$/,
                use: ["vue-style-loader", "css-loader"]
            }
        ]
    },
    plugins: [
        // make sure to include the plugin for the magic
        new VueLoaderPlugin()
    ],
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
        alias: {
            vue: "vue/dist/vue.js"
        }
    },
    devtool:
        this.move === "development" ? "eval-cheap-source-map" : "source-map"
};

module.exports = [electronTypeTarget];
