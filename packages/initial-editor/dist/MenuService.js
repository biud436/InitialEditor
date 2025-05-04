var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MenuService_1;
import { Component } from "./component";
import { KoreanMenu } from "./menu/KoreanMenu";
import { ElectronService } from "./ElectronService";
import { Service } from "typedi";
import "reflect-metadata";
import { injectableMenuCommands, MENU_COMMAND } from "./decorators/MenuCommand";
import { getMetadataStorage } from "./store/MeatadataStorage";
import { getShotcutService } from "./services/ShotcutService";
import { Platform } from "./utils/Platform";
const menu = {
    ko: KoreanMenu,
};
export var MenuButtonsSelector;
(function (MenuButtonsSelector) {
    MenuButtonsSelector[MenuButtonsSelector["MINIMIZE_WINDOW"] = 0] = "MINIMIZE_WINDOW";
    MenuButtonsSelector[MenuButtonsSelector["MAXIMIZE_WINDOW"] = 1] = "MAXIMIZE_WINDOW";
    MenuButtonsSelector[MenuButtonsSelector["CLOSE_WINDOW"] = 2] = "CLOSE_WINDOW";
})(MenuButtonsSelector || (MenuButtonsSelector = {}));
export var InitialEditor;
(function (InitialEditor) {
    /**
     * 툴바 셀렉터 정의
     */
    let MenuButtons;
    (function (MenuButtons) {
        MenuButtons.CLASSE_SELECTOR = {
            /**
             * 창 최소화
             */
            MINIMIZE_WINDOW: ".menu .control-box li.minimum",
            /**
             * 창 최대화
             */
            MAXIMIZE_WINDOW: ".menu .control-box li.maximum",
            /**
             * 창 닫기
             */
            CLOSE_WINDOW: ".menu .control-box li.close",
        };
    })(MenuButtons = InitialEditor.MenuButtons || (InitialEditor.MenuButtons = {}));
})(InitialEditor || (InitialEditor = {}));
/**
 * @namespace MenuButtonHandlers
 * @description 메뉴 버튼 핸들러를 정의합니다.
 */
var MenuButtonHandlers;
(function (MenuButtonHandlers) {
    /**
     * 창 최소화
     */
    function addMinimizeWindow() {
        document
            .querySelector(InitialEditor.MenuButtons.CLASSE_SELECTOR.MINIMIZE_WINDOW)
            .addEventListener("click", (ev) => {
            ElectronService.getInstance().emit("minimize");
        });
        return MenuButtonHandlers;
    }
    MenuButtonHandlers.addMinimizeWindow = addMinimizeWindow;
    /**
     * 창 최대화
     */
    function addMaximizeWindow() {
        document
            .querySelector(InitialEditor.MenuButtons.CLASSE_SELECTOR.MAXIMIZE_WINDOW)
            .addEventListener("click", (ev) => {
            ElectronService.getInstance().emit("maximize");
        });
        return MenuButtonHandlers;
    }
    MenuButtonHandlers.addMaximizeWindow = addMaximizeWindow;
    /**
     * 창 닫기
     */
    function addCloseWindow() {
        const elem = document.querySelector(InitialEditor.MenuButtons.CLASSE_SELECTOR.CLOSE_WINDOW);
        elem?.addEventListener("click", (ev) => { });
        return MenuButtonHandlers;
    }
    MenuButtonHandlers.addCloseWindow = addCloseWindow;
})(MenuButtonHandlers || (MenuButtonHandlers = {}));
/**
 * @class MenuService
 */
let MenuService = MenuService_1 = class MenuService extends Component {
    initMembers(...args) {
        /**
         * @type {MenuComponent}
         */
        this._menuComponent = args[1];
        this._isClickedMenu = false;
        MenuService_1.isReady = false;
    }
    start(...args) {
        if (!MenuService_1.isReady) {
            // this.hideMenuOnMac();
            this.changeMenuLocaleAsPersonalize();
            this.addMenuEventHandlers();
            this.beforeCollectClassDecorators();
            this.collectDecorators();
            MenuService_1.isReady = true;
        }
        return this;
    }
    /**
     * 맥에서 인라인 메뉴를 제거합니다.
     */
    hideMenuOnMac() {
        // if (process.platform === "darwin") {
        //     (<HTMLDivElement>document.querySelector(".menu")).style.display =
        //         "none";
        //     (<HTMLDivElement>(
        //         document.querySelector(".toolbar")
        //     )).style.marginTop = "0";
        // }
    }
    changeMenuLocaleAsPersonalize() {
        const langCode = navigator.language.slice(0, 2);
        const labels = Array.from(document.querySelectorAll(".menu__main label"));
    }
    /**
     * 클래스 데코레이터를 수집하고 메뉴 객체를 생성합니다.
     */
    beforeCollectClassDecorators() {
        const menuKeys = Object.keys(menu.ko);
        /**
         * 메뉴 재설정 (폐지 예정)
         * @deprecated
         */
        menuKeys.forEach((menuId) => {
            const items = Reflect.get(window, `${MENU_COMMAND}_${menuId}`, injectableMenuCommands[menuId]);
            menu.ko[menuId] = {
                name: "",
                children: items?.children,
            };
        });
        console.log(injectableMenuCommands);
        console.log("[before] beforeCollectClassDecorators");
        console.log(menu.ko);
        // 수집된 메뉴 출력
        getMetadataStorage().menuCommands.forEach((menuCommand) => {
            const { menuId } = menuCommand;
            const id = menuId;
            const items = Reflect.get(window, `${MENU_COMMAND}_${menuId}`, injectableMenuCommands[menuId]);
            menu.ko[id] = {
                name: menuCommand.name,
                children: {
                    ...items?.children,
                },
            };
        });
    }
    /**
     * 메소드 데코레이터를 수집합니다.
     */
    collectDecorators() {
        console.log("[after] collectDecorators");
        console.log(menu.ko);
        const shotcutService = getShotcutService();
        Object.values(menu.ko).forEach((item) => {
            if (item.children) {
                Object.keys(item.children).forEach((key) => {
                    const child = item.children?.[key];
                    const menuChild = typeof child === "function" ? child.prototype : child;
                    if (menuChild.action) {
                        const menuCommand = getMetadataStorage().menuCommands.find((e) => e.name == key);
                        const shotcut = menuCommand?.shortcut;
                        if (shotcut) {
                            const platform = Platform.isElectron()
                                ? "electron"
                                : "web";
                            let key = [];
                            if (platform === "darwin") {
                                key = shotcut.map((k) => k.replace("ctrl", "command"));
                            }
                            shotcutService.bind(key.join("+"), menuChild.action);
                        }
                    }
                });
            }
        });
    }
    addMenuEventHandlers() {
        MenuButtonHandlers.addMinimizeWindow()
            .addMaximizeWindow()
            .addCloseWindow();
    }
};
MenuService.isReady = false;
MenuService.injectableMenu = {};
MenuService = MenuService_1 = __decorate([
    Service()
], MenuService);
export default MenuService;
//# sourceMappingURL=MenuService.js.map