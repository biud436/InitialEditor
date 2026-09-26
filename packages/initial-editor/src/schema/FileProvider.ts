import {
    DataProviderCallback,
    DataProviderFileOption,
    IFileProvider,
} from "./IFileProvider";

const PREFIX_TOKEN = "initial-editor-fs:///";

/**
 * localStorage 기반 파일 제공자. 에디터 자체 설정(테마, 레이어 구성)처럼 브라우저에
 * 남겨도 되는 것에 쓴다. 게임 프로젝트 파일은 BridgeFileProvider 를 쓴다.
 */
export class FileProvider implements IFileProvider {
    private getFilename(filename: string) {
        return PREFIX_TOKEN + filename;
    }

    public readFile(
        filename: string,
        encoding: string,
        callback: DataProviderCallback
    ) {
        const retFileName = this.getFilename(filename);

        const content = localStorage.getItem(retFileName);

        if (!content) {
            return callback(new Error("File not found"));
        }

        return callback(null, content);
    }

    public writeFile(
        filename: string,
        content: string,
        option: DataProviderFileOption,
        callback: DataProviderCallback
    ) {
        if (!option) {
            return callback(new Error("Invalid option"));
        }

        const retFileName = this.getFilename(filename);

        if (!content) {
            return callback(new Error("Invalid content"));
        }

        localStorage.setItem(retFileName, content);
        return callback(null);
    }

    public readFileSync(filename: string, encoding: string) {
        if (!filename) {
            throw new Error("Invalid filename");
        }

        const retFileName = this.getFilename(filename);

        const content = localStorage.getItem(retFileName);
        if (!content) {
            throw new Error("File not found");
        }

        return content;
    }

    public existsSync(filename: string): boolean {
        if (!filename) {
            throw new Error("Invalid filename");
        }

        const retFileName = this.getFilename(filename);

        const content = localStorage.getItem(retFileName);
        if (!content) {
            return false;
        }

        return true;
    }

    public writeFileSync(filename: string, content: string, encoding: string) {
        if (!filename) {
            throw new Error("Invalid filename");
        }

        const retFileName = this.getFilename(filename);

        if (!content) {
            throw new Error("Invalid content");
        }

        localStorage.setItem(retFileName, content);
    }
}
