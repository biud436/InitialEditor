import * as path from "path";

namespace EntryPoint {
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
}

export = EntryPoint;
