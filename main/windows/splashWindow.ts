import { BrowserWindow } from "electron";
import * as path from "path";
import { config } from "../config";
import { EntryPoint } from "../utils/Path";

/**
 * Show up the splash window on the screen.
 *
 * @param mainWindow
 * @returns
 */
export async function showSplashWindow(
    mainWindow: BrowserWindow
): Promise<BrowserWindow> {
    const isProd: boolean = process.env.NODE_ENV === "production";

    const splash: BrowserWindow = new BrowserWindow(config.splashWindow.get());
    let url = "";
    if (isProd) {
        url = "app://./splash.html";
    } else {
        const port = process.argv[2];
        url = `http://localhost:${port}/splash`;
    }

    splash.loadURL(url);
    splash.center();
    splash.on("close", () => mainWindow.show());
    setTimeout(() => splash.close(), 5000);

    return splash;
}
