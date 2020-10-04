import App from "./App.js";
import {EventEmitter} from "./EventEmitter.js";
import BaseController from "./controllers/BaseController.js";

import GamePropertiesWindowController from "./controllers/GamePropertiesWindowController.js";
import GamePropertiesWindow from "./models/GamePropertiesWindow.js";
import TilesetWindowController from "./controllers/TilesetWindowController.js";
import { TilesetWindowModel } from "./models/TilesetWindow.js";

import {toCamelCase, getClassName} from "./camelCase.js";

class WindowCreator extends EventEmitter {

    /**
     * @param {App} app 
     */
    constructor() {
        super();

        this._app = App.GetInstance();

        this.cache = {};
    }

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

    update() {
        for(let i in this.cache) {
            if(this.cache[i] instanceof BaseController) {
                this.cache[i].remove();
            }
        }
    }

    /**
     * @param {MouseEvent}
     */
    static GrapWindow(ev) {
        const target = $(ev.currentTarget);
        if( !target ) {
            return;
        }

        const id = target.data("action");
        const creator = WindowCreator.GetInstance();
        const type = getClassName(id);
        const methodName = "on" + type;
        const cb = creator[methodName].bind(creator);

        if(typeof(cb) === "function") {
            cb();
        }
    }

    /**
     * @param {String} id 
     */
    static GrapWindowAsType(id) {
        const creator = WindowCreator.GetInstance();
        const type = getClassName(id);
        const methodName = "on" + type;
        const cb = creator[methodName].bind(creator);

        if(typeof(cb) === "function") {
            cb();
        }        
    }

    /**
     * 
     * @param {HTMLElement} elem 
     * @param {Number} id 
     */
    static onLoad(elem, id) {
        const creator = this.GetInstance();

        if(creator.cache[id]) {
            const self = creator.cache[id];
            creator.cache[id].onLoad(elem, self);
        }        
    }

    /**
     * @return {WindowCreator}
     */
    static GetInstance() {
        if(!WindowCreator.Instance) {
            WindowCreator.Instance = new WindowCreator();
        }

        return WindowCreator.Instance;
    }

}

WindowCreator.Instance = null;

export {WindowCreator};