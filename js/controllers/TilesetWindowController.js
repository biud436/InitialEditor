import TilesetWindowModel from "../models/TilesetWindow.js";
import BaseController from "./BaseController.js";

/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class TilesetWindowController extends BaseController {
    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config) {
        super( config );
    }

    onLoad(elem, self) {
        super.onLoad(elem, self);
        const parent = elem.parentNode;
        parent.querySelector(".tilesetWindow__control-box p i").onclick = () => {
            self.remove();
        };

        $(elem.parentNode).find(".tilesetWindow__panel #ok").on("click", ev => {
            this.onOk(ev);
        })

        $(elem.parentNode).find(".tilesetWindow__panel #cancel").on("click", ev => {
            this.onCancel(ev);
        })

        this.show();
    }   
    
    onOk(ev) {
        this.remove();
        
        const tilesets = this._element.find("input");
        const data = {
            tilesets: {
                name: $(tilesets[0]).val(),
                src: $(tilesets[1]).val(),
            },
            tile: {
                width: parseInt($(tilesets[2]).val()),
                height: parseInt($(tilesets[3]).val()),
            }
        }
        
        alert(JSON.stringify(data));
    }

    onCancel(ev) {
        this.remove();
    }

}