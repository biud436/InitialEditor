const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const chalk = require("chalk");

const FILES = {
    HTML: {
        INDEX: "index.html"
    },
    JS: {
        INDEX: "index.js"
    },
    DIST: "dist"
};

const PLATFORMS = ["darwin", "linux"];

const MESSAGES = {};

/**
 * @class ElectronBuilder
 */
class ElectronBuilder {
    constructor() {}

    copyFiles() {
        const root = path.resolve(__dirname, "../");

        fs.promises
            .copyFile(
                path.join(root, FILES.HTML.INDEX),
                path.join(root, FILES.DIST, FILES.HTML.INDEX)
            )
            .then(e => {
                console.log(
                    chalk.yellow(`${FILES.HTML.INDEX} copied`) + chalk.reset()
                );
            })
            .catch(e => {
                console.log(e);
            });

        fs.promises
            .copyFile(
                path.join(root, FILES.JS.INDEX),
                path.join(root, FILES.DIST, FILES.JS.INDEX)
            )
            .then(e => {
                console.log(
                    chalk.red(`${FILES.JS.INDEX} copied`) + chalk.reset()
                );
            })
            .catch(e => {
                console.log(e);
            });

        if (PLATFORMS.includes(process.platform)) {
            cp.exec(
                `cp -r ${path.resolve(root, "src")} ${path.resolve(
                    root,
                    FILES.DIST
                )}`
            );
        }
    }
}

const builder = new ElectronBuilder();
builder.copyFiles();
