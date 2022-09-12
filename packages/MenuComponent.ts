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
        // @ts-ignore
        document.querySelector("#none")?.checked = true;

        this._isMenuOpen = false;
    }

    public update<T extends HTMLElement = HTMLElement, R extends Mouse = Mouse>(
        target: T,
        mouse: R
    ) {
        // // 최상위 노드를 선택합니다.
        // /**
        //  * @type {HTMLElement}
        //  */
        let parentNode = target.parentNode; //
        const parentClassName = (<Element>parentNode).className;

        while (
            parentNode != null &&
            parentClassName.indexOf("menu__main") === -1
        ) {
            parentNode = parentNode.parentNode;
        }

        // const isOpenMenu = Array.from(
        //     document.querySelectorAll<HTMLUListElement>(".menu-style")
        // ).find((element) => {
        //     return getComputedStyle(element).display === "block";
        // });

        // 최상위 노드가 메인 메뉴라면
        if (parentNode && parentClassName.indexOf("menu__main") > -1) {
            // if (isOpenMenu) {
            // 메뉴가 열린 것으로 간주
            this._isMenuOpen = true;
        } else if (this._isMenuOpen && mouse.buttons.leftFire) {
            console.log("메뉴 닫힘을 호출하였습니다");
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
