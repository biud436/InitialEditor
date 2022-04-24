import { Component } from "./component";
import { MenuComponent } from "./MenuComponent";
import { KoreanMenu } from "./menu/KoreanMenu";
import { SIGKILL } from "constants";
import { ElectronService } from "./ElectronService";
import { ipcRenderer } from "electron";
import { Service } from "typedi";

const menu = {
    ko: KoreanMenu,
};

type MenuType = keyof typeof menu;

export namespace InitialEditor {
    /**
     * 툴바 셀렉터 정의
     */
    export namespace MenuButtons {
        export const CLASSE_SELECTOR: Record<string, string> = {
            MINIMIZE_WINDOW: ".menu .control-box li.minimum",
            MAXIMIZE_WINDOW: ".menu .control-box li.maximum",
            CLOSE_WINDOW: ".menu .control-box li.close",
        };
    }

    export type Platform = NodeJS.Platform | "electron";
}

/**
 * @namespace MenuButtonHandlers
 * @description 메뉴 버튼 핸들러를 정의합니다.
 */
namespace MenuButtonHandlers {
    /**
     * 창 최소화
     */
    export function addMinimizeWindow() {
        document
            .querySelector(
                InitialEditor.MenuButtons.CLASSE_SELECTOR.MINIMIZE_WINDOW
            )!
            .addEventListener("click", (ev) => {
                ElectronService.getInstance().emit("minimize");
            });

        return MenuButtonHandlers;
    }

    /**
     * 창 최대화
     */
    export function addMaximizeWindow() {
        document
            .querySelector(
                InitialEditor.MenuButtons.CLASSE_SELECTOR.MAXIMIZE_WINDOW
            )!
            .addEventListener("click", (ev) => {
                ElectronService.getInstance().emit("maximize");
            });

        return MenuButtonHandlers;
    }

    /**
     * 창 닫기
     */
    export function addCloseWindow() {
        const elem = document.querySelector(
            InitialEditor.MenuButtons.CLASSE_SELECTOR.CLOSE_WINDOW
        );

        elem?.addEventListener("click", (ev) => {
            switch (process.platform) {
                case "darwin":
                    process.exit(SIGKILL);
                default:
                    const electronService = ElectronService.getInstance();
                    electronService.close();
                    break;
            }
        });

        return MenuButtonHandlers;
    }
}

/**
 * @class MenuService
 */
@Service()
export default class MenuService extends Component {
    private _menuComponent!: MenuComponent;
    private _isClickedMenu!: boolean;
    public static isReady: boolean = false;

    public initMembers(...args: any[]) {
        /**
         * @type {MenuComponent}
         */
        this._menuComponent = args[1];
        this._isClickedMenu = false;
        MenuService.isReady = false;
    }

    public start(...args: any[]) {
        // 맥 OS에서 내부 메뉴를 제거합니다.
        if (process.platform === "darwin") {
            // (<HTMLDivElement>document.querySelector(".menu")).style.display =
            //     "none";
        }

        if (!MenuService.isReady) {
            // this.hideMenuOnMac();
            this.changeMenuLocaleAsPersonalize();
            this.changeToolbarIconOnMobileDevice();
            this.addMenuEventHandlers();
            MenuService.isReady = true;
        }

        return this;
    }

    /**
     * 맥에서 인라인 메뉴를 제거합니다.
     */
    public hideMenuOnMac() {
        if (process.platform === "darwin") {
            (<HTMLDivElement>document.querySelector(".menu")).style.display =
                "none";
            (<HTMLDivElement>(
                document.querySelector(".toolbar")
            )).style.marginTop = "0";
        }
    }

    public changeMenuLocaleAsPersonalize() {
        const langCode = navigator.language.slice(0, 2);

        const labels = Array.from<HTMLLabelElement>(
            document.querySelectorAll(".menu__main label")
        );
    }

    public addMenuEventHandlers() {
        MenuButtonHandlers.addMinimizeWindow()
            .addMaximizeWindow()
            .addCloseWindow();
    }

    public changeToolbarIconOnMobileDevice() {
        const media = window.matchMedia("(max-width: 640px)");
        if (media.matches) {
        }

        const resizeConfig = {
            ".contents": {
                width: "65%",
            },
            ".aside__tabs": {
                width: "30%",
            },
            "#contents__main-canvas": {
                width: "100%",
            },
        };
    }
}
