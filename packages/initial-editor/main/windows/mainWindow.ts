import { BrowserWindow } from "electron";

const isDev = process.env.IS_DEV == "true" ? true : false;

/**
 * @description
 * This class allows you to create a new window that is applied some configuration.
 */
export class MainWindow extends BrowserWindow {
    jQuery: any;
    $: any;

    private isProd: boolean = process.env.NODE_ENV === "production";

    constructor(options?: Electron.BrowserWindowConstructorOptions) {
        super(options);
        this.setConfiguration()
            .then(() => {})
            .catch((err) => {
                console.log(err);
            });
    }

    public async setConfiguration() {
        this.setMenuBarVisibility(false);
        this.$ = this.jQuery = require("jquery");
        if (this.isProd) {
            await this.loadURL("app://./home.html");
        } else {
            const port = process.argv[2];
            // await this.loadURL(`http://localhost:${port}/home`);
            await this.loadURL(`http://localhost:8080/home`);
            this.webContents.openDevTools();
        }
        this.webContents.once("dom-ready", () => {
            this.webContents.send("change-theme");
        });
    }

    public onMaximize() {
        let restoreSize = [];

        if (!this.isMaximized()) {
            restoreSize = this.getMaximumSize();
            this.maximize();
        } else {
            this.unmaximize();
        }
    }
}