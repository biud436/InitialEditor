import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";
import { promisify } from "util";
import config from "./react-package";

const spawn = promisify(cp.spawn);

async function bootstrap() {
    const { dependencies } = config;
    for (let i in dependencies) {
        const root = path.join(__dirname, "..");

        spawn("npm", ["install", i], {
            cwd: root,
        })
            .then((e) => {
                console.log(`${i}를 설치완료하였습니다`);
            })
            .catch((err) => {
                console.log(`${i}를 설치하는 중에 오류가 발생하였습니다.`);
            });
    }
}

bootstrap();
