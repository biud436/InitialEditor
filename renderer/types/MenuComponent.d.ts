import "reflect-metadata";
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
export declare namespace InitialEditor {
    interface Point {
        x: number;
        y: number;
    }
}
/**
 * @class MenuComponent
 * @description
 * 메뉴 컴포넌트 클래스는 메뉴가 열려있는 지 닫혀있는 지 판단합니다.
 */
declare class MenuComponent extends Component {
    _isMenuOpen: boolean;
    start(...args: any[]): MenuComponent;
    isMenuOpen(): boolean;
    hideMenu(): void;
    /**
     * 최상위 노드가 메인 메뉴인지 판단합니다.
     *
     * @param node
     * @returns
     */
    private isTopMostMenu;
    /**
     * 마우스 왼쪽 버튼이 클릭되었는지 확인합니다.
     * @param mouse
     * @returns
     */
    private isLeftMouseButtonOK;
    update<T extends HTMLElement = HTMLElement, R extends Mouse = Mouse>(target: T, mouse: R): void;
}
export { MenuComponent };
