import { ipcMain, ipcRenderer, IpcRenderer } from "electron";
import { EventEmitter } from "./EventEmitter";
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
    public static INSTANCE: ElectronService = new ElectronService();

    public static getInstance() {
        return ElectronService.INSTANCE;
    }

    public ipcMain: Electron.IpcMain;

    constructor() {
        super();

        this.ipcMain = ipcMain;
        this.listenEvents();
    }

    public *makeEvents(): IterableIterator<string> {
        yield "minimize";
        yield "maximize";
        yield "restore";
        yield "close";
    }

    private listenEvents() {
        const generator = this.makeEvents();

        while (true) {
            const event = generator.next();
            if (event.done) break;

            const value = (<string>event.value).toString();
            process.stdout.write(`listenEvents: ${value}\n`);

            this.on(value, () => {
                if (["maximize"].includes(value)) {
                    this.maximize();
                    return;
                }
                const func = this.getWindow()[value];
                if (typeof func === "function") {
                    func();
                }
            });
        }
    }

    public openFolder(folderName: string) {
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

    public getWindow() {
        return require("electron").remote.getCurrentWindow();
    }

    public maximize() {
        // const currentWindow = this.getWindow();
        // if (currentWindow.isMaximized()) {
        //     currentWindow.unmaximize();
        // } else {
        //     currentWindow.maximize();
        // }
        ipcRenderer.send("maximize");
    }

    public close() {
        this.quit();
    }

    public quit() {
        const currentWindow = this.getWindow();
        if (currentWindow) {
            currentWindow.close();
        }
    }
}

export { ElectronService };
