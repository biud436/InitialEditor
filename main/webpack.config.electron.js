const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

/**
 * @type {import("webpack").Configuration}
 */
module.exports = {
    mode: "development",
    target: "node",
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
                exclude: [/node_modules/],
                // tsconfig.json
            },
        ],
    },
};
