import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";
import * as url from "url";

namespace InitialEditor {
  export class Path {
    public static WORK_DIR = process.cwd();

    public static join(...paths: string[]): string {
      return url.pathToFileURL(path.join(...paths)).href;
    }

    public static resolve(...paths: string[]): string {
      return url.pathToFileURL(path.resolve(...paths)).href;
    }

    public static get separator(): string {
      return path.sep;
    }

    public static getWorkDir(): string {
      return Path.WORK_DIR.replace(/\\/g, "/");
    }
  }

  export class SSHConnection {
    constructor(private url: string) {}

    public connect(url: string): cp.ChildProcessWithoutNullStreams {
      return cp.spawn("ssh", [url]);
    }

    public async exec(command: string): Promise<string> {
      return new Promise((resolve, reject) => {
        if (process.platform === "win32") {
          reject("Not supported on windows");
          return;
        }

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

export default InitialEditor;
