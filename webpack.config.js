const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

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
                test: /\.ts$/,
                use: "ts-loader",
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
        ],
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    devtool:
        this.move === "development" ? "eval-cheap-source-map" : "source-map",
};

module.exports = [electronTypeTarget];
