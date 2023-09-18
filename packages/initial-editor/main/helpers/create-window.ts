import {
    screen,
    BrowserWindow,
    BrowserWindowConstructorOptions,
} from "electron";
import Store from "electron-store";

type Rect = Pick<
    BrowserWindowConstructorOptions,
    "x" | "y" | "width" | "height"
>;

type RequiredRect = {
    [K in keyof Rect]-?: Rect[K];
};

type RequiredSize = Pick<RequiredRect, "width" | "height">;

export default (
    windowName: string,
    options: BrowserWindowConstructorOptions
): BrowserWindow => {
    const key = "window-state";
    const name = `window-state-${windowName}`;
    const store = new Store({ name });
    const defaultSize: RequiredSize = {
        width: options.width ?? 800,
        height: options.height ?? 600,
    };
    let state = {};
    let win: BrowserWindow;

    const restore = () => store.get(key, defaultSize);

    const getCurrentPosition = () => {
        const position = win.getPosition();
        const size = win.getSize();
        return {
            x: position[0],
            y: position[1],
            width: size[0],
            height: size[1],
        };
    };

    const windowWithinBounds = (
        windowState: RequiredRect,
        bounds: RequiredRect
    ) => {
        return (
            windowState.x >= bounds.x &&
            windowState.y >= bounds.y &&
            windowState.x + windowState.width <= bounds.x + bounds.width &&
            windowState.y + windowState.height <= bounds.y + bounds.height
        );
    };

    const resetToDefaults = () => {
        const bounds = screen.getPrimaryDisplay().bounds;
        return Object.assign({}, defaultSize, {
            x: (bounds.width - defaultSize.width) / 2,
            y: (bounds.height - defaultSize.height) / 2,
        });
    };

    const ensureVisibleOnSomeDisplay = (windowState: RequiredRect) => {
        const visible = screen.getAllDisplays().some((display) => {
            return windowWithinBounds(windowState, display.bounds);
        });
        if (!visible) {
            // Window is partially or fully not visible now.
            // Reset it to safe defaults.
            return resetToDefaults();
        }
        return windowState;
    };

    const saveState = () => {
        if (!win.isMinimized() && !win.isMaximized()) {
            Object.assign(state, getCurrentPosition());
        }
        store.set(key, state);
    };

    state = ensureVisibleOnSomeDisplay(restore() as RequiredRect);

    const browserOptions: BrowserWindowConstructorOptions = {
        ...options,
        ...state,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            ...options.webPreferences,
        },
    };
    win = new BrowserWindow(browserOptions);

    win.on("close", saveState);

    return win;
};
