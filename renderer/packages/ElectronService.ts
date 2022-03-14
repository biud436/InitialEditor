import { ipcMain, ipcRenderer, IpcRenderer, dialog, shell } from "electron";
import { EventEmitter } from "./EventEmitter";
import * as fs from "fs";
import * as cp from "child_process";
import * as path from "path";
import { Component } from "./component";
import { Toolbar } from "./toolbar/Toolbar";
import { Service } from "typedi";

/**
 * @class ElectronService
 * @description
 * 일렉트론과 IPC를 하기 위해 만든 클래스입니다.
 *
 * 다양한 플랫폼에서 동작할 수 있게 서비스 형태로 제공합니다.
 *
 * 조건 컴파일을 통하여 구현될 예정입니다.
 */

@Service()
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

  /**
   * 이벤트를 차례대로 접근해 호출합니다.
   */
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
        ipcRenderer.send(value);
        // const func = this.getWindow()[value];
        // if (typeof func === "function") {
        //   func();
        // }
      });
    }
  }

  /**
   * 폴더를 엽니다.
   *
   * @param folderName
   */
  public openFolder(folderName: string = process.cwd()) {
    const current = path.join(folderName.replace(/\\/g, "/"));
    shell.showItemInFolder(current);
  }

  public getWindow() {
    // remote module is deprecated in Electron v14.0
    // https://www.electronjs.org/docs/latest/breaking-changes#planned-breaking-api-changes-140
  }

  public maximize() {
    ipcRenderer.send("maximize");
  }

  public close() {
    this.quit();
  }

  public showErrorMessageBox(title: string, message: string) {
    MessageBoxComponent.showError(title, message);
  }

  public quit() {
    ipcRenderer.sendSync("close");
  }
}

class MessageBoxComponent extends Component {
  public static showError(title: string, message: string) {
    ipcRenderer.send("message_box:error", title, message);
  }
}

export { ElectronService };
