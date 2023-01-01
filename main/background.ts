import * as path from "path";
import * as fs from "fs";
import { app, BrowserWindow, ipcMain, Menu, dialog, screen } from "electron";
import { MainWindow } from "./windows/mainWindow";
import { config, MonitorInfo } from "./config";
import { showSplashWindow } from "./windows/splashWindow";
import { EntryPoint as Ep } from "./utils/Path";
import serve from "electron-serve";

const Path = Ep.Path;

const isProd: boolean = process.env.NODE_ENV === "production";
if (isProd) {
    serve({ directory: "app" });
} else {
    app.setPath("userData", `${app.getPath("userData")} (development)`);
}

/**
 * @author biud436
 * @description
 * This class allows you to create the electron application and start.
 */
export class EntryPoint {
    private _hostWindow!: MainWindow | null;
    private isProd: boolean = process.env.NODE_ENV === "production";

    constructor() {
        this.initWithTitle();
        this.createUserDataStorage();
    }

    /**
     * Sets the title of an application from hard-coded text.
     */
    initWithTitle() {
        app.setName("InitialEditor");
    }

    createUserDataStorage() {
        if (this.isProd) {
            serve({ directory: "app" });
        } else {
            app.setPath("userData", `${app.getPath("userData")} (development)`);
        }
    }

    /**
     * Prints the information of each monitor.
     * if you are using multiple monitors, you can use this method to print the information of each monitor.
     */
    printMonitorInfo() {
        const data = <MonitorInfo>{};
        const displays = screen.getAllDisplays();

        // 모니터의 갯수입니다.
        displays.forEach((e, i) => {
            const monitorId = e.id;

            data[monitorId] = {
                x: e.bounds.x,
                y: e.bounds.y,
                width: e.size.width,
                height: e.size.height,
            };
        });
        fs.writeFileSync("display.json", JSON.stringify(data, null, 4));
    }

    connectIPC(hostWindow: MainWindow) {
        hostWindow.on("closed", () => {
            this._hostWindow = null;
        });

        // 별도의 패턴으로 정리해야 할 필요성이 있음.
        ipcMain.on("minimize", () => hostWindow.minimize());
        ipcMain.on("maximize", () => hostWindow.onMaximize());
        ipcMain.on("message_box:error", (event, ...args: any[]) => {
            const [title, content] = args;
            dialog.showErrorBox(title, content);
        });
        ipcMain.on("close", () => hostWindow.close());
        ipcMain.on("set-resolution", (event, [width, height]) => {
            hostWindow.setSize(width, height);
        });
    }

    /**
     * Creates an internal menu on macOS.
     * However This is not completed development.
     */
    createInternalMenuForDarwin(hostWindow: MainWindow) {
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
                                    hostWindow.webContents.send("new-file");
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
    }

    /**
     * Creates a main window of the application.
     * Host Window means the main window that contains a tile editor that can draw tiles.
     *
     * @returns
     */
    createWindow() {
        this.connectIPC(
            (this._hostWindow = new MainWindow(config.mainWindow.get()))
        );

        this.printMonitorInfo();
        this.createInternalMenuForDarwin(this._hostWindow);

        return this;
    }

    /**
     * Sets event listeners.
     */
    listenOn() {
        app.whenReady().then(() => {
            this.createWindow();
            if (process.platform === "darwin") {
                ipcMain.emit("creatSystemMenu", this._hostWindow);
            }

            // open develooper tools
            this._hostWindow!.webContents.openDevTools({
                mode: "detach",
            });
            this._hostWindow!.center();
            showSplashWindow(this._hostWindow!);
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
