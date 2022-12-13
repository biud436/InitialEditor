import "reflect-metadata";
import { Inject, Service } from "typedi";
import { Component } from "./component";
import { KoreanMenu } from "./menu/KoreanMenu";
import { Logger } from "./utils/Logger";

interface Mouse {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    buttons: {
        left: boolean;
        leftFire: boolean;
    };
    target: HTMLElement;
    menuTarget: HTMLElement;
}

export namespace InitialEditor {
    export interface Point {
        x: number;
        y: number;
    }
}

/**
 * @class MenuComponent
 * @description
 * 메뉴 컴포넌트 클래스는 메뉴가 열려있는 지 닫혀있는 지 판단합니다.
 */
@Service()
class MenuComponent extends Component {
    public _isMenuOpen!: boolean;

    start(...args: any[]) {
        this._isMenuOpen = false;

        return this;
    }

    public isMenuOpen() {
        return this._isMenuOpen;
    }

    public hideMenu() {
        const menu = document.getElementById("none") as HTMLInputElement | null;

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
    private isTopMostMenu(node?: ParentNode | null) {
        if (!node) return false;
        const parentClassName = (<Element>node).className ?? "";

        return node && parentClassName?.indexOf("menu__main") > -1;
    }

    public update<T extends HTMLElement = HTMLElement, R extends Mouse = Mouse>(
        target: T,
        mouse: R
    ) {
        if (!target) {
            console.warn("target is undefined");
            return;
        }

        let parentNode = target.parentNode;

        if (!parentNode) {
            console.warn("parentNode is undefined");
            return;
        }

        const parentClassName = (<Element>parentNode).className ?? "";

        while (
            parentNode != null &&
            parentClassName?.indexOf("menu__main") === -1
        ) {
            parentNode = parentNode.parentNode;
        }

        if (this.isTopMostMenu(parentNode)) {
            this._isMenuOpen = true;
        } else if (this._isMenuOpen && mouse.buttons.leftFire) {
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
}

export { MenuComponent };
