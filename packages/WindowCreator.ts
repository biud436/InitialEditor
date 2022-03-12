import App from "./App";
import { EventEmitter } from "./EventEmitter";
import BaseController from "./controllers/BaseController";
import GamePropertiesWindowController from "./controllers/GamePropertiesWindowController";
import GamePropertiesWindow from "./models/GamePropertiesWindow";
import TilesetWindowController from "./controllers/TilesetWindowController";
import { TilesetWindowModel } from "./models/TilesetWindow";

import { getClassName } from "./camelCase";
import { Service } from "typedi";

namespace WindowManager {
    export interface Cache {
        [key: string]: BaseController;
    }
}

@Service()
class CacheManager extends EventEmitter {
    public static cache: WindowManager.Cache = {};
    public static INSTANCE: CacheManager;

    public static get(key: string): BaseController {
        return this.cache[key];
    }

    public static set(key: string, value: BaseController): void {
        this.cache[key] = value;
    }

    public static clear(): void {
        this.cache = {};
    }
}

@Service()
class WindowCreator extends EventEmitter {
    public static INSTANCE: WindowCreator = null;

    private _app: App;
    private _gamePropertiesWindow: GamePropertiesWindowController;
    private _tilesetWindow: TilesetWindowController;

    /**
     * @param {App} app
     */
    constructor() {
        super();

        this._app = App.GetInstance();
    }

    /**
     * This method is called when clicking the file menu.
     *
     * 창을 생성한 후 캐시에 저장을 해둡니다.
     */
    onFileNew() {
        // 윈도우를 생성합니다.
        this._gamePropertiesWindow = new GamePropertiesWindowController(
            new GamePropertiesWindow()
        );

        this._gamePropertiesWindow
            .render()
            .then((ret) => {
                const id = "new-window";
                CacheManager.set(id, this._gamePropertiesWindow);
                this._gamePropertiesWindow.setUniqueId(id);
            })
            .catch((err) => {
                console.warn(err);
            });
    }

    /**
     * Open the tools option window.
     * This window allows you to add a new tile image on the tileset canvas window of this map editor.
     */
    onToolsOptions() {
        this._tilesetWindow = new TilesetWindowController(
            new TilesetWindowModel()
        );

        this._tilesetWindow
            .render()
            .then((ret) => {
                const id = "tileset";
                CacheManager.set(id, this._tilesetWindow);
                this._tilesetWindow.setUniqueId(id);
            })
            .catch((err) => {
                console.warn(err);
            });
    }

    onFileSave() {
        window.app.emit("tilemap:save");
    }

    /**
     * This method removes all cache window for some times.
     */
    update() {
        for (let i in CacheManager.cache) {
            if (CacheManager.get(i) instanceof BaseController) {
                CacheManager.get(i).remove();
            }
        }
    }

    /**
     * Create a certain window.
     * @param {MouseEvent}
     */
    static GrapWindow(ev: any): void {
        const target = $(ev.currentTarget);
        if (!target) {
            return;
        }

        const id = target.data("action");
        const creator = WindowCreator.GetInstance();
        const type = getClassName(id);
        const methodName = "on" + type;
        // @ts-ignore
        const cb = creator[methodName].bind(creator);

        if (typeof cb === "function") {
            cb();
        }
    }

    /**
     * Create a specific window as type.
     * the type name is the same as data-action property.
     * @param {String} id
     */
    static GrapWindowAsType(id: string): void {
        const creator = WindowCreator.GetInstance();
        const type = getClassName(id);
        const methodName = "on" + type;
        // @ts-ignore
        const cb = creator[methodName].bind(creator);

        if (typeof cb === "function") {
            cb();
        }
    }

    /**
     * Load a window from the cache data.
     *
     * @param {HTMLElement} elem
     * @param {Number} id
     */
    static onLoad(elem: HTMLElement, id: string): void {
        const creator = this.GetInstance();

        // 이미 생성된 창이 있으면 해당 요소의 onLoad 메소드를 호출하여 창을 다시 호출합니다.
        if (CacheManager.get(id)) {
            const self = CacheManager.get(id);
            CacheManager.get(id).onLoad(elem, self);
        }
    }

    /**
     * Gets a single instance.
     *
     * @return {WindowCreator}
     */
    static GetInstance(): WindowCreator {
        if (!WindowCreator.INSTANCE) {
            WindowCreator.INSTANCE = new WindowCreator();
        }

        return WindowCreator.INSTANCE;
    }
}

export { WindowCreator };
