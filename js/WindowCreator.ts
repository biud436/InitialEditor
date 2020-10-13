import App from "./App";
import {EventEmitter} from "./EventEmitter";
import BaseController from "./controllers/BaseController";

import GamePropertiesWindowController from "./controllers/GamePropertiesWindowController";
import GamePropertiesWindow from "./models/GamePropertiesWindow";
import TilesetWindowController from "./controllers/TilesetWindowController";
import { TilesetWindowModel } from "./models/TilesetWindow";

import {toCamelCase, getClassName} from "./camelCase.js";

class WindowCreator extends EventEmitter {
    
    public static Instance: WindowCreator = null;
    public cache: any;

    private _app: App;
    private _gamePropertiesWindow: GamePropertiesWindowController;
    private _tilesetWindow: TilesetWindowController;
    
    /**
     * @param {App} app 
     */
    constructor() {
        super();

        this._app = App.GetInstance();

        this.cache = {};
    }

    /**
     * This method is called when clicking the file menu.
     */
    onFileNew() {

        this._gamePropertiesWindow = new GamePropertiesWindowController(new GamePropertiesWindow());

        this._gamePropertiesWindow.render()
            .then(ret => {
                const id = "new-window";
                this.cache[id] = this._gamePropertiesWindow;

                this._gamePropertiesWindow.setUniqueId(id);
            })
            .catch(err => {
                console.warn(err);
            });        
    }

    /**
     * Open the tools option window.
     * This window allows you to add a new tile image on the tileset canvas window of this map editor.
     */
    onToolsOptions() {
        this._tilesetWindow = new TilesetWindowController(new TilesetWindowModel());

        this._tilesetWindow.render()
            .then(ret => {
                const id = "tileset";
                this.cache[id] = this._tilesetWindow;
                
                this._tilesetWindow.setUniqueId(id);
            })
            .catch(err => {
                console.warn(err);
            })
    }    

    /**
     * This method removes all cache window for some times.
     */
    update() {
        for(let i in this.cache) {
            if(this.cache[i] instanceof BaseController) {
                this.cache[i].remove();
            }
        }
    }

    /**
     * Create a certain window.
     * @param {MouseEvent}
     */
    static GrapWindow(ev: any): void {
        const target = $(ev.currentTarget);
        if( !target ) {
            return;
        }

        const id = target.data("action");
        const creator = WindowCreator.GetInstance();
        const type = getClassName(id);
        const methodName = "on" + type;
        // @ts-ignore
        const cb = creator[methodName].bind(creator);

        if(typeof(cb) === "function") {
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

        if(typeof(cb) === "function") {
            cb();
        }        
    }

    /**
     * Load a window from the cache data.
     * 
     * @param {HTMLElement} elem 
     * @param {Number} id 
     */
    static onLoad(elem: HTMLElement, id: number): void {
        const creator = this.GetInstance();

        if(creator.cache[id]) {
            const self = creator.cache[id];
            creator.cache[id].onLoad(elem, self);
        }        
    }

    /**
     * Gets a single instance.
     * 
     * @return {WindowCreator}
     */
    static GetInstance(): WindowCreator {
        if(!WindowCreator.Instance) {
            WindowCreator.Instance = new WindowCreator();
        }

        return WindowCreator.Instance;
    }

}

export {WindowCreator};