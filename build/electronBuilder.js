const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const chalk = require("chalk");
const { EventEmitter } = require("events");

const FILES = {
    HTML: {
        INDEX: "index.html"
    },
    JS: {
        INDEX: "index.js"
    },
    DIST: "dist",
    UNIX_BASE_PLATFORMS: ["darwin", "linux"]
};

/**
 * @class ElectronBuilder
 */
class ElectronBuilder extends EventEmitter {
    constructor() {
        super();
        this.on("ready", () => this.copyFiles());
    }

    copyFiles() {
        const root = path.resolve(__dirname, "../");

        Promise.all([
            fs.promises
                .copyFile(
                    path.join(root, FILES.HTML.INDEX),
                    path.join(root, FILES.DIST, FILES.HTML.INDEX)
                )
                .then(e => {
                    console.log(
                        chalk.yellow(`${FILES.HTML.INDEX} copied`) +
                            chalk.reset()
                    );
                })
                .catch(e => {
                    console.log(e);
                }),
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
                })
        ])
            .then(() => {
                if (FILES.UNIX_BASE_PLATFORMS.includes(process.platform)) {
                    cp.exec(
                        `cp -r ${path.resolve(root, "src")} ${path.resolve(
                            root,
                            FILES.DIST
                        )}`
                    );

                    fs.readdirSync(path.resolve(root, FILES.DIST)).forEach(
                        file => {
                            const filePath = path.resolve(
                                root,
                                FILES.DIST,
                                file
                            );
                            console.log(
                                chalk.yellow(`${filePath} copied`) +
                                    chalk.reset()
                            );
                        }
                    );
                }
            })
            .catch(err => {
                console.warn(err);
            });
    }
}

const builder = new ElectronBuilder();
builder.emit("ready");
