import { Path } from "../utils/Path";
import { BrowserWindow } from "electron";
import * as path from "path";

/**
 * @description
 * This class allows you to create a new window that is applied some configuration.
 */
export class MainWindow extends BrowserWindow {
    jQuery: any;
    $: any;

    constructor(options?: Electron.BrowserWindowConstructorOptions) {
        super(options);
        this.setConfiguration();
    }

    setConfiguration() {
        this.setMenuBarVisibility(false);
        this.$ = this.jQuery = require("jquery");
        this.loadURL(Path.join(Path.getWorkDir(), "index.html"));
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
