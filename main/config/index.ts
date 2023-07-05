export type StartingWindowOfMap = "mainWindow" | "splashWindow";
export type ElectronStartingConfig = {
    [key in StartingWindowOfMap]: {
        get: () => Electron.BrowserWindowConstructorOptions;
    };
};
export type MonitorInfo = Record<
    number,
    {
        x: number;
        y: number;
        width: number;
        height: number;
    }
>;

/**
 * @description This object creates a configuration object for the application.
 */
export const config: ElectronStartingConfig = {
    mainWindow: {
        get(): Electron.BrowserWindowConstructorOptions {
            // 브라우저 창을 생성합니다.
            const isMacOS = process.platform === "darwin";
            const windowRect = {
                width: 1280,
                height: 720,
            };
            const options: Electron.BrowserWindowConstructorOptions = {
                ...windowRect,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    devTools: true,
                    // allowRunningInsecureContent: true,
                },
                show: false,
                frame: isMacOS ? true : false,
                titleBarStyle: isMacOS ? "default" : "hidden",
                darkTheme: true,
                alwaysOnTop: false,
            };

            return options;
        },
    },
    splashWindow: {
        get(): Electron.BrowserWindowConstructorOptions {
            return {
                width: 1280,
                height: 640,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    devTools: true,
                },
                frame: false,
                alwaysOnTop: true,
                center: true,
                modal: true,
            };
        },
    },
};
