const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const webpack = require("webpack");

/**
 * @type {import("webpack").Configuration}
 */
module.exports = {
    mode: "development",
    target: "node",
    node: {
        __dirname: true,
    },
    entry: path.resolve(__dirname, "background.ts"),
    output: {
        path: path.resolve(__dirname, "..", "public"),
        filename: "bundle.js",
    },
    resolve: {
        extensions: [".ts", ".js"],
        plugins: [
            new TsconfigPathsPlugin({
                configFile: path.resolve(__dirname, "tsconfig.json"),
            }),
        ],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: [/node_modules/, /renderer/, /packages/],
            },
        ],
    },
    plugins: [
        new webpack.EnvironmentPlugin({
            NODE_ENV: "development",
            IS_DEV: true,
        }),
    ],
    devtool: "source-map",
    stats: "normal",
};
