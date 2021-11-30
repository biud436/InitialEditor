const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "../");
const cp = require("child_process");
const chalk = require("chalk");

fs.promises
    .copyFile(path.join(root, "index.html"), path.join(root, "dist/index.html"))
    .then(e => {
        console.log(chalk.yellow("index.html copied") + chalk.reset());
    })
    .catch(e => {
        console.log(e);
    });

fs.promises
    .copyFile(path.join(root, "index.js"), path.join(root, "dist/index.js"))
    .then(e => {
        console.log(chalk.red("index.js copied") + chalk.reset());
    })
    .catch(e => {
        console.log(e);
    });

if (["darwin", "linux"].includes(process.platform)) {
    cp.exec(`cp -r ${path.resolve(root, "src")} ${path.resolve(root, "dist")}`);
}
