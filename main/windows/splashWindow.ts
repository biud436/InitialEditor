import { BrowserWindow } from "electron";
import * as path from "path";
import { config } from "../config";
import { EntryPoint } from "../utils/Path";

/**
 * 메인 경로를 반환합니다.
 *
 * @returns
 */
export function getEntryPointPath() {
    return EntryPoint.Path.join(
        EntryPoint.Path.getWorkDir(),
        "public",
        "splash.html"
    );
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
