const path = require("path");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const webpack = require("webpack");
const dependencies = require("../package.json").dependencies;

/**
 * @type {import("webpack").Configuration}
 */
module.exports = {
    externals: [...Object.keys(dependencies || {})],
    mode: "development",
    target: "node",
    node: {
        __dirname: true,
    },
    entry: path.resolve(__dirname, "background.ts"),
    output: {
        path: path.resolve(__dirname, "..", "public"),
        filename: "bundle.js",
        // https://github.com/webpack/webpack/issues/1114
        library: {
            type: "commonjs2",
        },
    },
    resolve: {
        extensions: [".ts", ".js"],
        modules: ["node_modules"],
        plugins: [
            new TsconfigPathsPlugin({
                configFile: path.resolve(__dirname, "tsconfig.json"),
            }),
        ],
    },
    module: {
        rules: [
            {
                test: /\.[jt]sx?$/,
                exclude: /node_modules/,
                use: {
                    loader: "ts-loader",
                    options: {
                        // Remove this line to enable type checking in webpack builds
                        transpileOnly: true,
                        compilerOptions: {
                            module: "esnext",
                        },
                    },
                },
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
    node: {
        __dirname: false,
        __filename: false,
    },
};
