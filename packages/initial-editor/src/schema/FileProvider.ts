import { get } from "jquery";

interface DataProviderFileOption {
    encoding: string;
}

const PREFIX_TOKEN = "initial-editor-fs:///";
type DataProviderCallback = (err?: Error | null, data?: unknown) => void;

export class FileProvider {
    private getFilename(filename: string) {
        return PREFIX_TOKEN + filename;
    }

    public readFile(
        filename: string,
        encoding: string,
        callback: DataProviderCallback,
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
        callback: DataProviderCallback,
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
