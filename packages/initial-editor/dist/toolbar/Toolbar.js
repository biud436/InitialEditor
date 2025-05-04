var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { FileToolbar } from "./FileToolbar";
import { EditToolbar } from "./EditToolbar";
import { ModeToolbar } from "./ModeToolbar";
import { DrawToolbar } from "./DrawToolbar";
import { OtherToolbar } from "./OtherToolbar";
import { Service } from "typedi";
import { ToolbarContainer } from "./ToolbarContainer";
// 모든 배열을 하나로 합칩니다.
const Toolbar = (new Array().concat(FileToolbar, EditToolbar, ModeToolbar, DrawToolbar, OtherToolbar));
/**
 * @class ToolbarManager
 * @description
 * This class allows you to control the toolbar and hide or show in the current tool.
 */
let ToolbarManager = class ToolbarManager {
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
        this._toolbarContainer = new ToolbarContainer(this._mainToolbarId);
        this._originPosition = (this._toolbarContainer.getBoundingClientRect());
    }
    /**
     * Shows up the toolbar.
     */
    show() {
        this._isOpened = true;
        this._toolbarContainer.show();
    }
    /**
     * Hides out the toolbar.
     */
    hide() {
        this._isOpened = false;
        this._toolbarContainer.hide();
    }
    lock() {
        // $(this._mainToolbarId).draggable({ disabled: true });
    }
    unlock() {
        this._toolbarContainer.unlock(this._originPosition);
        // $(this._mainToolbarId).draggable({ disabled: false });
    }
    getElement(e) {
        return (Array.from(document.querySelectorAll(`li[data-action='${e.children}']`)).splice(-1)[0]);
    }
    create() {
        // $(`li`, this._mainToolbarId).each((index, elem) => {
        //     console.log(elem, Toolbar[index]);
        // });
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
        Toolbar.slice(0).forEach((e) => {
            let target = this.getElement(e);
            if (target) {
                target.onclick = (ev) => {
                    if (typeof e.action === "function") {
                        e.action.call(this, ev);
                    }
                };
            }
        });
    }
};
ToolbarManager = __decorate([
    Service(),
    __metadata("design:paramtypes", [])
], ToolbarManager);
export { Toolbar, ToolbarManager };
//# sourceMappingURL=Toolbar.js.map