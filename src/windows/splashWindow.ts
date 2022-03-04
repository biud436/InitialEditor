import { Path } from "../utils/Path";
import { BrowserWindow } from "electron";
import * as path from "path";
import { config } from "../config";

/**
 * 메인 경로를 반환합니다.
 *
 * @returns
 */
export function getEntryPointPath() {
    switch (process.platform) {
        case "darwin":
            return Path.join(Path.getWorkDir(), "public", "splash.html");
        default:
            return path.join(__dirname, "..", "..", "public", "splash.html");
    }
}

/**
 * Show up the splash window on the screen.
 *
 * @param mainWindow
 * @returns
 */
export function showSplashWindow(mainWindow: BrowserWindow): BrowserWindow {
    const url = getEntryPointPath();

    const splash: BrowserWindow = new BrowserWindow(config.splashWindow.get());
    splash.loadURL(url);
    splash.center();
    splash.on("closed", () => mainWindow.show());

    setTimeout(() => splash.close(), 5000);

    return splash;
}
