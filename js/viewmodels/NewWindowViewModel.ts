import {ViewModel} from "./ViewModel";
import BaseController from "../controllers/BaseController";

export class NewWindowViewModel extends ViewModel {
    
    constructor(__controller : BaseController) {
        super(__controller);
    }

    initMembers() {

    }

    onCreate(elem?: HTMLElement, ...args: any[]) {
        super.onCreate(elem, ...args);
        
        const parent = elem.parentNode;
        (parent.querySelector(".newWindow__control-box p i") as HTMLElement).onclick = () => {
            this._controller.remove();  
        };
        this._controller.show();
        $(".darken, .windows-container").css("left", "0");
    }

    onShow(elem?: JQuery<HTMLElement>) {
        
    }

}