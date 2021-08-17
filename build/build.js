const cd = require("child_process");
const path = require("path");

let stack = [];

const isUnixBase =
    process.platform.indexOf("darwin") !== -1 ||
    process.platform.indexOf("linux") !== -1;
const buildCommand = isUnixBase
    ? `npx webpack --config=webpack.config.js`
    : `chcp 65001 | npx webpack --config=webpack.config.js`;

let child = cd.exec(
    buildCommand,
    { cwd: path.join(__dirname, "..") },
    (err, stdout, stdin) => {
        if (err) {
            throw new Error(err.stack);
        }
    }
);

child.stdout.on("data", c => {
    stack.push(c);
});

child.stdout.on("error", c => {
    stack.push(c);
});

child.on("exit", (code, signal) => {
    console.log("빌드가 완료되었습니다.");
    cd.execSync("npm run start", {
        cwd: path.join(__dirname, "..")
    });
});
