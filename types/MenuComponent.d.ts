import { Component } from "./Component";
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
declare class MenuComponent extends Component {
    private _isMenuOpen;
    private _originalPos;
    private _currentTarget;
    start(...args: any[]): this;
    isMenuOpen(): boolean;
    hideMenu(): void;
    update(target: HTMLElement, mouse: Mouse): void;
}
export { MenuComponent };
