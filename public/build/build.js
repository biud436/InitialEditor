const cd = require('child_process');
const path = require('path');

let stack = [];

let child = cd.exec(`chcp 65001 | npx webpack --config=webpack.config.js`, {cwd: path.join(__dirname, "..")}, (err, stdout, stdin) => {
    if(err) {
        throw new Error(err.stack);
    }
});

child.stdout.on("data", c => {
    stack.push(c);
});

child.stdout.on("error", c => {
    stack.push(c);
});

child.on("exit", (code, signal) => {
    console.log("빌드가 완료되었습니다.");
});