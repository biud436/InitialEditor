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
        parent.querySelector(".tileset-window__control-box p i").onclick = () => {
            self.hide();
            $(".darken").fadeOut();
        };
    }    

}