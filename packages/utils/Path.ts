import * as path from "path";
import * as fs from "fs";

namespace InitialEditor {
    export class Path {
        public static WORK_DIR = process.cwd();

        join(...paths: string[]): string {
            return path.join(...paths);
        }

        resolve(...paths: string[]): string {
            return path.resolve(...paths);
        }

        get separator(): string {
            return path.sep;
        }

        getWorkDir(): string {
            return Path.WORK_DIR;
        }
    }
}

export = InitialEditor;
