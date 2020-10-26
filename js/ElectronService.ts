import { IpcMain } from "electron";
import {EventEmitter} from "./EventEmitter";
const { ipcMain } = require('electron');
import * as fs from 'fs';
import * as cp from "child_process";
import * as path from "path";

class ElectronService extends EventEmitter {

    public ipcMain: IpcMain;

    constructor() {
        super();
        
        this.ipcMain = ipcMain;
    }

    openFolder(folderName: string) {
        const { shell } = require('electron');
        shell.showItemInFolder(folderName);        

        // 탐색기에 포커스를 맞춥니다 (외부 프로그램 사용)
        if(process.platform.includes("win")) {
            const myPath = path.resolve(`tools/bin/open_folder.exe`);
            if(fs.existsSync(myPath)) {
                cp.spawn(myPath, ["CabinetWClass"]);
            }
        }

    }
}

export {ElectronService};