import { FileProvider } from "./FileProvider";
class Schema {
    constructor(config) {
        this.fileProvider = new FileProvider();
        this.initMembers(config);
    }
    initMembers(config) { }
    /**
     * 멤버 변수를 JSON 데이터로 변환합니다.
     */
    toJson() {
        return JSON.stringify(this, null, 2);
    }
    /**
     * 설정 파일을 로드하여 문자열로 반환합니다.
     *
     * @param filename
     * @returns
     */
    load(filename) {
        if (!filename) {
            filename = this.constructor.name;
        }
        return new Promise((resolve, reject) => {
            this.fileProvider.readFile(filename, "utf-8", (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(data);
            });
        });
    }
    /**
     * 파일로 내보냅니다 (비동기 방식)
     *
     * @param filename
     */
    toFile(filename) {
        if (!filename) {
            filename = this.constructor.name;
        }
        const contents = this.toJson();
        return new Promise((resolve, reject) => {
            this.fileProvider.writeFile(filename, contents, {
                encoding: "utf8",
            }, (err) => {
                if (err) {
                    reject(err.message);
                }
                resolve();
            });
        });
    }
}
export { Schema };
//# sourceMappingURL=Schema.js.map