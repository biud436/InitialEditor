import { Service } from "typedi";
import { Component } from "./component";

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
        document
            .querySelector<HTMLDivElement>("#none")!
            .setAttribute("checked", "true");
        this._isMenuOpen = false;
    }

    public update<T extends HTMLElement = HTMLElement, R extends Mouse = Mouse>(
        target: T,
        mouse: R
    ) {
        // 최상위 노드를 선택합니다.
        /**
         * @type {HTMLElement}
         */
        let parentNode = target.parentNode; //
        const parentClassName = (<Element>parentNode).className;

        while (parentNode != null && parentClassName !== "menu__main") {
            parentNode = parentNode.parentNode;
        }

        // 최상위 노드가 메인 메뉴라면
        if (parentNode && parentClassName === "menu__main") {
            // 메뉴가 열린 것으로 간주
            this._isMenuOpen = true;
        } else if (this._isMenuOpen && mouse.buttons.leftFire) {
            this.hideMenu();
        }
    }
}

export { MenuComponent };
