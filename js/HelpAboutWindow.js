import HelpAboutWindowModel from "./model/helpAbout";
import BaseController from "./BaseController.js";

export default class HelpAboutWindow extends BaseController {
    constructor(config) {
        super(config);
    }

    onLoad(elem, self) {
        super.onLoad(elem, self);
        const parent = elem.parentNode;
        parent.querySelector(".newWindow__control-box p i").onclick = () => {
            self.hide();
        };
    }    
}