/// <reference types="node" />
import { Component } from "./component";
export declare namespace InitialEditor {
    /**
     * 툴바 셀렉터 정의
     */
    namespace MenuButtons {
        const CLASSE_SELECTOR: Record<string, string>;
    }
    type Platform = NodeJS.Platform | "electron";
}
/**
 * @class MenuService
 */
export default class MenuService extends Component {
    private _menuComponent;
    private _isClickedMenu;
    static isReady: boolean;
    initMembers(...args: any[]): void;
    start(...args: any[]): this;
    /**
     * 맥에서 인라인 메뉴를 제거합니다.
     */
    hideMenuOnMac(): void;
    changeMenuLocaleAsPersonalize(): void;
    addMenuEventHandlers(): void;
    changeToolbarIconOnMobileDevice(): void;
}
