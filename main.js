const { app, BrowserWindow, ipcMain } = require("electron");

/**
 * @description This object creates a configuration object for the application.
 */
const Config = {
    get() {
        // 브라우저 창을 생성합니다.
        const isMacOS = process.platform === "darwin";
        const windowRect = {
            width: 1280,
            height: 720
        };
        const options = {
            ...windowRect,
            webPreferences: {
                enableRemoteModule: true,
                nodeIntegration: true,
                contextIsolation: false
            },
            frame: isMacOS ? true : false
        };

        return options;
    }
};

/**
 * @description
 * This class allows you to create a new window that is applied some configuration.
 */
class MainWindow extends BrowserWindow {
    constructor(options) {
        super(options);
        this.setConfiguration();
    }

    setConfiguration() {
        this.setMenuBarVisibility(false);
        this.$ = this.jQuery = require("jquery");
        this.loadURL("file://" + __dirname + "/index.html");
        this.webContents.once("dom-ready", () => {
            this.webContents.send("change-theme");
        });
    }

    onMaximize() {
        let restoreSize = [];

        if (!this.isMaximized()) {
            restoreSize = this.getMaximumSize();
            this.maximize();
        } else {
            this.unmaximize();
        }
    }
}

/**
 * @author biud436
 * @description
 * This class allows you to create the electron application and start.
 */
class EntryPoint {
    constructor() {
        this._hostWindow = null;
    }

    createWindow() {
        this._hostWindow = new MainWindow(Config.get());
        ipcMain.on("minimize", this._hostWindow.minimize);
        ipcMain.on("maximize", this._hostWindow.onMaximize);

        return this;
    }

    listenOn() {
        app.whenReady().then(() => {
            this.createWindow();
        });

        app.on("window-all-closed", () => {
            if (process.platform !== "darwin") {
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
