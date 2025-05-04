var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import "reflect-metadata";
import { Service } from "typedi";
import { Component } from "./component";
/**
 * @class MenuComponent
 * @description
 * 메뉴 컴포넌트 클래스는 메뉴가 열려있는 지 닫혀있는 지 판단합니다.
 */
let MenuComponent = class MenuComponent extends Component {
    start(...args) {
        this._isMenuOpen = false;
        return this;
    }
    isMenuOpen() {
        return this._isMenuOpen;
    }
    hideMenu() {
        const menu = document.getElementById("none");
        if (menu) {
            menu.checked = true;
            this._isMenuOpen = false;
        }
    }
    /**
     * 최상위 노드가 메인 메뉴인지 판단합니다.
     *
     * @param node
     * @returns
     */
    isTopMostMenu(node) {
        if (!node)
            return false;
        const parentClassName = node.className ?? "";
        return node && parentClassName?.indexOf("menu__main") > -1;
    }
    /**
     * 마우스 왼쪽 버튼이 클릭되었는지 확인합니다.
     * @param mouse
     * @returns
     */
    isLeftMouseButtonOK(mouse) {
        return this._isMenuOpen && mouse.buttons.leftFire;
    }
    update(target, mouse) {
        if (!target) {
            console.warn("target is undefined");
            return;
        }
        let parentNode = target.parentNode;
        if (!parentNode) {
            console.warn("parentNode is undefined");
            return;
        }
        const parentClassName = parentNode.className ?? "";
        // this code block would be splitted a function named 'findRootMenuItem'
        while (parentNode != null &&
            parentClassName?.indexOf("menu__main") === -1) {
            parentNode = parentNode.parentNode;
        }
        if (this.isTopMostMenu(parentNode)) {
            this._isMenuOpen = true;
        }
        else if (this.isLeftMouseButtonOK(mouse)) {
            this.hideMenu();
            // 마우스가 클릭되었을 때
            const extractAction = target.dataset.action;
            if (extractAction) {
                const action = Reflect.get(window, `MENU_${extractAction}`);
                if (action) {
                    action();
                }
            }
        }
    }
};
MenuComponent = __decorate([
    Service()
], MenuComponent);
export { MenuComponent };
//# sourceMappingURL=MenuComponent.js.map