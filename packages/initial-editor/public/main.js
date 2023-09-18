const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const { platform } = require("os");

let mainWindow;

const DEV_SERVER_URL = "http://localhost:3000";

/**
 * Create the main window for the application.
 *
 * @returns {void}
 */
function createWindow() {
    const isMacOS = platform === "darwin";
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false,
            devTools: isDev,
        },
        frame: isMacOS ? true : false,
    });

    mainWindow.loadURL(
        isDev
            ? DEV_SERVER_URL
            : `file://${path.join(__dirname, "../build/index.html")}`
    );

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }

    mainWindow.setResizable(true);
    mainWindow.on("close", () => {
        mainWindow = null;
        if (process.platform !== "darwin") {
            app.quit();
        }
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    mainWindow.focus();

    connectIPC(mainWindow);
}

/**
 *
 * @param {BrowserWindow} hostWindow
 */
function connectIPC(hostWindow) {
    hostWindow.on("closed", () => {
        this._hostWindow = null;
    });

    // 별도의 패턴으로 정리해야 할 필요성이 있음.
    ipcMain.on("minimize", () => hostWindow.minimize());
    ipcMain.on("maximize", () => hostWindow.onMaximize());
    ipcMain.on("message_box:error", (event, ...args) => {
        const [title, content] = args;
        dialog.showErrorBox(title, content);
    });
    ipcMain.on("close", () => hostWindow.close());
    ipcMain.on("set-resolution", (event, width, height) => {
        hostWindow.setSize(width, height);
    });
}

function activate() {
    app.setName("InitialEditor");
}

// ==== 3
app.on("ready", createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
        activate();
    }
});
