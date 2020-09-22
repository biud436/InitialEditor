import HelpAboutWindowModel from "./model/helpAbout.js";
import BaseController from "./BaseController.js";

export default class HelpAboutWindow extends BaseController {
    constructor(config) {
        super(config);
    }

    onLoad(elem, self) {
        super.onLoad(elem, self);
        const parent = elem.parentNode;
    }    
}