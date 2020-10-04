import GamePropertiesWindowModel from "../models/GamePropertiesWindow.js";
import BaseController from "./BaseController.js";

/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class GamePropertiesWindowController extends BaseController {

    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config) {
        super( config );
    }

    onLoad(elem, self) {
        super.onLoad(elem, self);
        const parent = elem.parentNode;
        parent.querySelector(".newWindow__control-box p i").onclick = () => {
            self.remove();
            
        };
        this.show();
        $(".darken, .windows-container").css("left", "0");
    }

    onClick(ev) {
        // 창을 화면에 보이게 합니다.
        this.show();
        // 펼쳐진 메뉴를 다시 접습니다.
        $("#none").prop("checked", true);        
    }

    onOkButton(ev) {
        const container = $("#newContainer #newWindow");
        const inp = container.find("input");
        const data = {
            gameName: $(inp[0]).val(),
            gameFolder: $(inp[1]).val(),
            author: $(inp[2]).val(),
        };

        alert(JSON.stringify(data, null, "\t"));
        this.remove();
    }

    addEventHandlers(elem, self) {        
        const container = $("#newContainer #newWindow");
        const okButton = container.find("div.panel");
        okButton.eq(0).on("click", ev => {
            this.onOkButton(ev); 
        });
    }
}
