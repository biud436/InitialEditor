const cd = require("child_process");
const path = require("path");

const FLAG = {
    ENDED: 0,
    RUNNING: 1
};

function startBuild() {
    let stack = [];

    console.log("Starting build...");

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

    child.stdout.pipe(process.stdout);
    child.on("exit", (code, signal) => {
        console.log("빌드가 완료되었습니다.");
        const sub = cd.exec(
            "npm run start",
            {
                cwd: path.join(__dirname, ".."),
                stdio: "inherit",
                shell: true,
                killSignal: "SIGTERM",
                timeout: 0
            },
            (err, stdout, stdin) => {
                if (err) {
                    throw new Error(err.stack);
                }
            }
        );
        sub.on("close", (code, signal) => {
            console.log("종료되었습니다 (빠른 실행 대기중)");
            process.exit(0);
        });
        sub.on("exit", (code, signal) => {
            process.exit(0);
        });
    });
}

startBuild();
