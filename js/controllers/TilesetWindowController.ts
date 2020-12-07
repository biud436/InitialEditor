import {TilesetWindowModel} from "../models/TilesetWindow";
import BaseController from "./BaseController";
import {TilesetWindowViewModel} from "../viewmodels/TilesetWindowViewModel";
import App from "../app.js";
import { ThemeManager } from "../ThemeManager";

enum Theme {
    DARK = 0,
    LIGHT = 1
};

/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class TilesetWindowController extends BaseController {

    protected _view: TilesetWindowViewModel;

    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config: any) {
        super( config );
    }

    createViewModel() {
        this._view = new TilesetWindowViewModel(this);
    }

    onLoad(elem: any, self: any): void  {
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

        /**
         * @type JQuery<HTMLInputElement>
         */
        const inputElement = $("input#image-load-dialog") as JQuery<HTMLInputElement>;
        inputElement.on("change", (ev) => {
            /**
             * @type {File[]}
             */
            const files = Array.from(ev.target.files);
            console.log(files[0].name, files[0].path);

        })

        this.show();
    }   
    
    onOk(ev: any): void {
        
        const themeIndex = $("#theme-select-box").prop("selectedIndex");

        const themeManager = new ThemeManager();

        if(themeIndex == Theme.DARK) {
            $("body").data("theme", "dark");
            themeManager.changeDarkTheme(true);
        } else {
            $("body").data("theme", "light");
            themeManager.changeLightTheme(true);
        }

        this._view.onOk(ev);
    }

    onCancel(ev: any): void {
        ev.preventDefault();
        this.remove();
    }

}