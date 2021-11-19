const { app, BrowserWindow, ipcMain } = require("electron");

function createWindow() {
    // 브라우저 창을 생성합니다.
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false
    });

    win.setMenuBarVisibility(false);

    win.$ = win.jQuery = require("jquery");

    win.loadURL("file://" + __dirname + "/index.html");

    ipcMain.on("minimize", () => {
        win.minimize();
    });

    win.webContents.once("dom-ready", () => {
        win.webContents.send("change-theme");
    });

    // ipcMain.on("exit", () => {
    //     win.close();
    // });

    let restoreSize = [];

    ipcMain.on("maximize", () => {
        if (!win.isMaximized()) {
            restoreSize = win.getMaximumSize();
            win.maximize();
        } else {
            win.unmaximize();
        }
    });
}

// 이 메소드는 Electron의 초기화가 완료되고
// 브라우저 윈도우가 생성될 준비가 되었을때 호출된다.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
    app.quit();
});

app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
