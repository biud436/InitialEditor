import * as path from "path";
import * as url from "url";

export namespace EntryPoint {
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
}
