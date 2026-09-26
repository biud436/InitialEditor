var InitialEditor;
(function (InitialEditor) {
    class Path {
        static get separator() {
            return "/";
        }
        static getWorkDir() {
            return Path.WORK_DIR.replace(/\\/g, "/");
        }
    }
    Path.WORK_DIR = "/";
    InitialEditor.Path = Path;
})(InitialEditor || (InitialEditor = {}));
export default InitialEditor;
//# sourceMappingURL=Path.js.map