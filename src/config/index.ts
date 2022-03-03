export type StartingWindowOfMap = "mainWindow" | "splashWindow";
export type ElectronStartingConfig = {
    [key in StartingWindowOfMap]: {
        get: () => Electron.BrowserWindowConstructorOptions;
    };
};

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
                    enableRemoteModule: true,
                    nodeIntegration: true,
                    contextIsolation: false,
                    devTools: true,
                },
                show: false,
                frame: isMacOS ? true : false,
                titleBarStyle: isMacOS ? "default" : "hidden",
                darkTheme: true,
                alwaysOnTop: true,
            };

            return options;
        },
    },
    splashWindow: {
        get(): Electron.BrowserWindowConstructorOptions {
            return {
                width: 1280,
                height: 640,
                frame: false,
                alwaysOnTop: true,
                center: true,
                modal: true,
            };
        },
    },
};
