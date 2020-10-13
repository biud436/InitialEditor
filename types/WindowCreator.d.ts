export class WindowCreator extends EventEmitter {
    /**
     * Create a certain window.
     * @param {MouseEvent}
     */
    static GrapWindow(ev: any): void;
    /**
     * Create a specific window as type.
     * the type name is the same as data-action property.
     * @param {String} id
     */
    static GrapWindowAsType(id: string): void;
    /**
     * Load a window from the cache data.
     *
     * @param {HTMLElement} elem
     * @param {Number} id
     */
    static onLoad(elem: HTMLElement, id: number): void;
    /**
     * Gets a single instance.
     *
     * @return {WindowCreator}
     */
    static GetInstance(): WindowCreator;
    _app: App;
    cache: {};
    /**
     * This method is called when clicking the file menu.
     */
    onFileNew(): void;
    _gamePropertiesWindow: GamePropertiesWindowController;
    /**
     * Open the tools option window.
     * This window allows you to add a new tile image on the tileset canvas window of this map editor.
     */
    onToolsOptions(): void;
    _tilesetWindow: TilesetWindowController;
    /**
     * This method removes all cache window for some times.
     */
    update(): void;
}
export namespace WindowCreator {
    const Instance: any;
}
import { EventEmitter } from "./EventEmitter.js";
import App from "./App.js";
import GamePropertiesWindowController from "./controllers/GamePropertiesWindowController.js";
import TilesetWindowController from "./controllers/TilesetWindowController.js";
