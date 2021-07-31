import { IpcMain } from "electron";
import { EventEmitter } from "./EventEmitter";
const { ipcMain } = require("electron");
import * as fs from "fs";
import * as cp from "child_process";
import * as path from "path";

/**
 * @class ElectronService
 * @description
 * 일렉트론과 IPC를 하기 위해 만든 클래스입니다.
 *
 * 다양한 플랫폼에서 동작할 수 있게 서비스 형태로 제공합니다.
 *
 * 조건 컴파일을 통하여 구현될 예정입니다.
 */
class ElectronService extends EventEmitter {
    public ipcMain: IpcMain;

    constructor() {
        super();

        this.ipcMain = ipcMain;
    }

    openFolder(folderName: string) {
        const { shell } = require("electron");
        shell.showItemInFolder(folderName);

        // 탐색기에 포커스를 맞춥니다 (외부 프로그램 사용)
        if (process.platform.includes("win")) {
            // 절대 경로를 가져옵니다.
            const myPath = path.resolve(`tools/bin/open_folder.exe`);

            if (fs.existsSync(myPath)) {
                cp.spawn(myPath, ["CabinetWClass"]);
            }
        } else if (process.platform === "darwin") {
        }
    }
}

export { ElectronService };
