const { app, BrowserWindow } = require("electron");
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
    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    mainWindow.focus();
}

function activate() {
    app.setName("InitialEditor");
}

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
