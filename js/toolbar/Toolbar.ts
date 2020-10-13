import {FileToolbar} from "./FileToolbar";
import {EditToolbar} from "./EditToolbar";
import {ModeToolbar} from "./ModeToolbar";
import {DrawToolbar} from "./DrawToolbar";
import {OtherToolbar} from "./OtherToolbar";

// 모든 배열을 하나로 합칩니다.
const Toolbar = [].concat(
    FileToolbar, 
    EditToolbar, 
    ModeToolbar,
    DrawToolbar,
    OtherToolbar,
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

        this._originPosition = $(this._mainToolbarId).get(0).getBoundingClientRect();
    }

    /**
     * Shows up the toolbar.
     */
    show() {
        this._isOpened = true;

        $(this._mainToolbarId)
            .show();
    }

    /**
     * Hides out the toolbar.
     */
    hide() {
        this._isOpened = false;

        $(this._mainToolbarId)
            .hide();

    }

    lock() {
        $(this._mainToolbarId).draggable({disabled: true});
    }

    unlock() {
        const {x, y} = this._originPosition;

        $(this._mainToolbarId).css({
            left: x,
            top: y,
        });

        $(this._mainToolbarId).draggable({disabled: false});
    }

    create() {
        $(`li`, this._mainToolbarId).each((index, elem) => {
            console.log(elem, Toolbar[index]);
        })

        /**
         * @type {{name: String, children: String, action: Function}[]}
         */
        const items = Toolbar.slice(0);
        items.forEach((e, i, a) => {
            const target = $(`li[data-action='${e.children}']:last`);
            if(target.get()[0]) {
                target.on("click", ev => {
                    if(typeof(e.action) === "function") {
                        e.action.call(this, ev);
                    }
                });
            }
        });
    }
    
}

(<any>window).ToolbarManager = new ToolbarManager();

export {Toolbar, ToolbarManager};