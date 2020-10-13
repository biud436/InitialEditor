import {TilesetWindowModel} from "../models/TilesetWindow";
import BaseController from "./BaseController";
import App from "../app.js";

/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class TilesetWindowController extends BaseController {
    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config: any) {
        super( config );
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

            // 타일셋을 다시 그립니다.            
            // app._tilesetCanvas.refreshTilesets(files[0].path);

        })

        this.show();
    }   
    
    onOk(ev: any): void {
        this.remove();
        
        /**
         * @type JQuery<HTMLInputElement>
         */
        const tilesets = this._element.find("input");
        const data = {
            tilesets: {
                name: $(tilesets[0]).val(),
                src: $(tilesets[1]).val(),
            },
            tile: {
                width: parseInt($(tilesets[2]).val() as any),
                height: parseInt($(tilesets[3]).val() as any),
            }
        }
        
        $('form[name="uploadTilesetImage"]').on("submit", function(e) {
            e.preventDefault();

            $.ajax({
                type: 'POST',
                cache:false,
                contentType: false,
                processData: false,
                url: $(this).attr('action'),
                data: new FormData(this as HTMLFormElement),
                success: function(msg) {
                    console.log(msg);
                },
                error: function(data){
                    console.log("error");
                    console.log(data);
                }                
            });
        });    
    }

    onCancel(ev: any): void {
        ev.preventDefault();
        this.remove();
    }

}