import * as path from "path";
import * as fs from "fs";
import { app, BrowserWindow, ipcMain, Menu, dialog, screen } from "electron";
import { MainWindow } from "./windows/mainWindow";
import { config } from "./config";
import { showSplashWindow } from "./windows/splashWindow";

/**
 * @author biud436
 * @description
 * This class allows you to create the electron application and start.
 */
class EntryPoint {
    private _hostWindow: MainWindow;

    constructor() {
        this.initWithTitle();
    }

    initWithTitle() {
        app.setName("InitialEditor");
    }

    createWindow() {
        this._hostWindow = new MainWindow(config.mainWindow.get());
        ipcMain.on("minimize", () => this._hostWindow.minimize());
        ipcMain.on("maximize", () => this._hostWindow.onMaximize());

        ipcMain.on("message_box:error", (event, ...args: any[]) => {
            const [title, content] = args;
            dialog.showErrorBox(title, content);
        });

        (() => {
            const data: Record<any, object> = {};
            const displays = screen.getAllDisplays();

            // 모니터의 갯수입니다.
            displays.forEach((e, i) => {
                data[e.id] = {
                    x: e.bounds.x,
                    y: e.bounds.y,
                    width: e.size.width,
                    height: e.size.height,
                };
            });
            fs.writeFileSync("display.json", JSON.stringify(data, null, 4));
        })();

        // 이렇게 하면 타입스크립트로 작성된 걸 불러와야 한다.
        // 잘못된 구조로 짠 듯 싶다.
        if (process.platform === "darwin") {
            Menu.setApplicationMenu(
                Menu.buildFromTemplate([
                    {
                        role: "appMenu",
                        label: "InitialEditor",
                        submenu: [
                            {
                                role: "quit",
                            },
                        ],
                    },
                    {
                        label: "파일",
                        role: "fileMenu",
                        submenu: [
                            {
                                label: "새로 만들기",
                                accelerator: "CmdOrCtrl+N",
                                click: () => {
                                    this._hostWindow.webContents.send(
                                        "new-file"
                                    );
                                },
                            },
                            {
                                label: "프로그램 종료",
                                accelerator: "CmdOrCtrl+Q",
                                role: "quit",
                            },
                        ],
                    },
                ])
            );
        }

        return this;
    }

    listenOn() {
        app.whenReady().then(() => {
            this.createWindow();
            if (process.platform === "darwin") {
                ipcMain.emit("creatSystemMenu", this._hostWindow);
            }

            // open develooper tools
            this._hostWindow.webContents.openDevTools({
                mode: "detach",
            });
            this._hostWindow.center();
            showSplashWindow(this._hostWindow);
        });

        app.on("window-all-closed", () => {
            switch (process.platform) {
                case "darwin":
                    process.exit(0);
                case "win32":
                    app.quit();
                    break;
                default:
                    app.quit();
            }
        });

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });
    }

    static builder() {
        return new EntryPoint();
    }
}

EntryPoint.builder().listenOn();
