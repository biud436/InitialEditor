import { Component } from "./component";
import "reflect-metadata";
export declare enum MenuButtonsSelector {
    MINIMIZE_WINDOW = 0,
    MAXIMIZE_WINDOW = 1,
    CLOSE_WINDOW = 2
}
export declare namespace InitialEditor {
    /**
     * 툴바 셀렉터 정의
     */
    namespace MenuButtons {
        const CLASSE_SELECTOR: Record<keyof typeof MenuButtonsSelector, string>;
    }
    type Platform = NodeJS.Platform | "electron";
}
/**
 * @class MenuService
 */
/**
 * 전역 키보드 단축키를 실제로 묶는 메뉴 명령. 나머지 명령은 메뉴 클릭으로만 실행된다.
 * (브라우저 예약 조합과 스텁 명령을 전역에 묶지 않기 위한 허용 목록)
 */
export declare const BINDABLE_MENU_SHORTCUTS: Set<string>;
export default class MenuService extends Component {
    private _menuComponent;
    private _isClickedMenu;
    static isReady: boolean;
    static injectableMenu: Record<string, any>;
    initMembers(...args: any[]): void;
    start(...args: any[]): this;
    /**
     * 맥에서 인라인 메뉴를 제거합니다.
     */
    hideMenuOnMac(): void;
    changeMenuLocaleAsPersonalize(): void;
    /**
     * 클래스 데코레이터를 수집하고 메뉴 객체를 생성합니다.
     */
    beforeCollectClassDecorators(): void;
    /**
     * 메소드 데코레이터를 수집합니다.
     */
    collectDecorators(): void;
    addMenuEventHandlers(): void;
}
