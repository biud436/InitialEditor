import {ViewModel} from "./ViewModel";
import BaseController from "../controllers/BaseController";

export class TilesetWindowViewModel extends ViewModel {
    
    constructor(__controller : BaseController) {
        super(__controller);
    }

    initMembers() {

    }

    onCreate(elem?: HTMLElement, ...args: any[]) {
        super.onCreate(elem, ...args);
    }

    onShow(elem?: JQuery<HTMLElement>) {
        
    }

    onOk(ev: any): void {
        this._controller.remove();
        
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

}