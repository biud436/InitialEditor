import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";

namespace InitialEditor {
    export class Path {
        public static WORK_DIR = process.cwd();

        public static join(...paths: string[]): string {
            return path.join(...paths);
        }

        public static resolve(...paths: string[]): string {
            return path.resolve(...paths);
        }

        public static get separator(): string {
            return path.sep;
        }

        public static getWorkDir(): string {
            return Path.WORK_DIR;
        }
    }

    export class SSHConnection {
        constructor(private url: string) {}

        public connect(url: string): cp.ChildProcessWithoutNullStreams {
            return cp.spawn("ssh", [url]);
        }

        public async exec(command: string): Promise<string> {
            return new Promise((resolve, reject) => {
                const ssh = this.connect(this.url);
                ssh.stdout.on("data", (data: any) => {
                    resolve(data);
                });
                ssh.stderr.on("data", (data: any) => {
                    reject(data);
                });
                ssh.stdin.write(command);
                ssh.stdin.end();
            });
        }
    }
}

export = InitialEditor;
