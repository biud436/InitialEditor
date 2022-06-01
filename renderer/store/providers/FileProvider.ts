import { makeAutoObservable } from "mobx";
import * as fs from "fs";
import * as path from "path";

export class FileProvider {
    constructor() {
        makeAutoObservable(this);
    }

    isExist(filePath: fs.PathLike): boolean {
        return fs.existsSync(filePath);
    }

    createFile(
        filePath: fs.PathLike,
        content: string | Uint8Array
    ): Promise<void> {
        if (!this.isExist(filePath)) {
            return Promise.reject();
        }
        return fs.promises.writeFile(filePath, content, {
            encoding: "utf-8",
        });
    }

    readFile(
        filePath: fs.PathLike,
        encoding: BufferEncoding = "utf-8"
    ): Promise<Buffer | string> {
        if (!this.isExist(filePath)) {
            return Promise.reject();
        }
        return fs.promises.readFile(filePath, { encoding });
    }

    readDirectories(rootPath: fs.PathLike): Promise<string[]> {
        if (!this.isExist(rootPath)) {
            return Promise.reject();
        }
        return fs.promises.readdir(rootPath);
    }
}

export const fileProvider = new FileProvider();
