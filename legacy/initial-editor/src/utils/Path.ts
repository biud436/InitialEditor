namespace InitialEditor {
    export class Path {
        public static WORK_DIR = "/";

        public static get separator(): string {
            return "/";
        }

        public static getWorkDir(): string {
            return Path.WORK_DIR.replace(/\\/g, "/");
        }
    }
}

export default InitialEditor;
