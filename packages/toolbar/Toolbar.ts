import { FileToolbar } from "./FileToolbar";
import { EditToolbar } from "./EditToolbar";
import { ModeToolbar } from "./ModeToolbar";
import { DrawToolbar } from "./DrawToolbar";
import { OtherToolbar } from "./OtherToolbar";

// 모든 배열을 하나로 합칩니다.
const Toolbar = [].concat(
    FileToolbar,
    EditToolbar,
    ModeToolbar,
    DrawToolbar,
    OtherToolbar
);

/**
 * @class ToolbarManager
 * @description
 * This class allows you to control the toolbar and hide or show in the current tool.
 */


class ToolbarManager {
    _mainToolbarId: string;
    _isOpened: boolean;
    _isMovable: boolean;
    _originPosition: DOMRect;
    container : HTMLElement;

    constructor() {

        this.initMembers();
        this.create();

    }

    initMembers() {
        this._mainToolbarId = ".toolbar";
        this._isOpened = false;

        // Setting up as true this variable, it can't move the toolbar.
        this._isMovable = false;
        this.lock();
        this.container = document.querySelector(this._mainToolbarId);
        this._originPosition = this.container.getBoundingClientRect();
    }

    /**
     * Shows up the toolbar.
     */
    show() {
        this._isOpened = true;
        this.container.style.display = "block";
    }

    /**
     * Hides out the toolbar.
     */
    hide() {
        this._isOpened = false;
        this.container.style.display = "none";
    }

    lock() {
        $(this._mainToolbarId).draggable({ disabled: true });
    }

    unlock() {
        this.container.style.left = this._originPosition.x + "px";
        this.container.style.top = this._originPosition.y + "px";

       $(this._mainToolbarId).draggable({ disabled: false });
    }

    create() {
        $(`li`, this._mainToolbarId).each((index, elem) => {
            console.log(elem, Toolbar[index]);
        });

        /**
         * @type {{name: String, children: String, action: Function}[]}
         */

        /*
        *
        *   원래 셀렉터 : $(`li[data-action='${e.children}']:last`)
        *   현재 셀렉터 : `li[data-action='${e.children}']`
        * 
        *   :last 
        *   일치하는 것중에서 마지막요소를 가져옵니다
        * 
        *   JQUERY 를 없애고자 JQUERY에서만 쓸 수 있는 css 선택자인 :last를 제거했기때문에
        *   querySelectorAll 을 통해 전부 불러오고 splice -1 로 마지막 요소를 꺼내는것으로 바꾸었습니다 
        *   
        * 
        */
        Toolbar.slice(0).forEach( e => {
            let target = Array.from(document.querySelectorAll(`li[data-action='${e.children}']`)).splice(-1)[0] as HTMLElement;
            if( target ){
                target.onclick = (ev:any) => {
                    if (typeof e.action === "function") {
                        e.action.call(this, ev);
                    }
                }
            }
        } );
        
        
    }
}

export { Toolbar, ToolbarManager };
