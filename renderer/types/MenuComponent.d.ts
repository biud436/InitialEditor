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
    start(...args: any[]): this;
    isMenuOpen(): boolean;
    hideMenu(): void;
    update<T extends HTMLElement = HTMLElement, R extends Mouse = Mouse>(target: T, mouse: R): void;
}
export { MenuComponent };
