/// <reference types="node" />
import * as cp from "child_process";
declare namespace InitialEditor {
    class Path {
        static WORK_DIR: string;
        static join(...paths: string[]): string;
        static resolve(...paths: string[]): string;
        static get separator(): string;
        static getWorkDir(): string;
    }
    class SSHConnection {
        private url;
        constructor(url: string);
        connect(url: string): cp.ChildProcessWithoutNullStreams;
        exec(command: string): Promise<string>;
    }
}
export default InitialEditor;
