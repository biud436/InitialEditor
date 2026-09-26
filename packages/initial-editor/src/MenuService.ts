import { Component } from "./component";
import { MenuComponent } from "./MenuComponent";
import { IMenuItem, KoreanMenu, MenuKeys } from "./menu/KoreanMenu";
import { ElectronService } from "./ElectronService";
import { Service } from "typedi";
import "reflect-metadata";
import { injectableMenuCommands, MENU_COMMAND } from "./decorators/MenuCommand";
import { getMetadataStorage, Optional } from "./store/MeatadataStorage";
import { getShotcutService } from "./services/ShotcutService";

const menu = {
    ko: KoreanMenu,
} as const;

type MenuType = keyof typeof menu;

export enum MenuButtonsSelector {
    MINIMIZE_WINDOW,
    MAXIMIZE_WINDOW,
    CLOSE_WINDOW,
}

export namespace InitialEditor {
    /**
     * 툴바 셀렉터 정의
     */
    export namespace MenuButtons {
        export const CLASSE_SELECTOR: Record<
            keyof typeof MenuButtonsSelector,
            string
        > = {
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
                InitialEditor.MenuButtons.CLASSE_SELECTOR.MINIMIZE_WINDOW,
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
                InitialEditor.MenuButtons.CLASSE_SELECTOR.MAXIMIZE_WINDOW,
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
            InitialEditor.MenuButtons.CLASSE_SELECTOR.CLOSE_WINDOW,
        );

        elem?.addEventListener("click", (ev) => {});

        return MenuButtonHandlers;
    }
}

/**
 * @class MenuService
 */
/**
 * 전역 키보드 단축키를 실제로 묶는 메뉴 명령. 나머지 명령은 메뉴 클릭으로만 실행된다.
 * (브라우저 예약 조합과 스텁 명령을 전역에 묶지 않기 위한 허용 목록)
 */
export const BINDABLE_MENU_SHORTCUTS = new Set<string>([
    "file-save",
    "file-open",
    "file-export",
]);

@Service()
export default class MenuService extends Component {
    private _menuComponent!: MenuComponent;
    private _isClickedMenu!: boolean;
    public static isReady: boolean = false;

    public static injectableMenu: Record<string, any> = {};

    public initMembers(...args: any[]) {
        /**
         * @type {MenuComponent}
         */
        this._menuComponent = args[1];
        this._isClickedMenu = false;
        MenuService.isReady = false;
    }

    public start(...args: any[]) {
        if (!MenuService.isReady) {
            // this.hideMenuOnMac();
            this.changeMenuLocaleAsPersonalize();
            this.addMenuEventHandlers();
            this.beforeCollectClassDecorators();
            this.collectDecorators();
            MenuService.isReady = true;
        }

        return this;
    }

    /**
     * 맥에서 인라인 메뉴를 제거합니다.
     */
    public hideMenuOnMac() {
        // if (process.platform === "darwin") {
        //     (<HTMLDivElement>document.querySelector(".menu")).style.display =
        //         "none";
        //     (<HTMLDivElement>(
        //         document.querySelector(".toolbar")
        //     )).style.marginTop = "0";
        // }
    }

    public changeMenuLocaleAsPersonalize() {
        const langCode = navigator.language.slice(0, 2);

        const labels = Array.from<HTMLLabelElement>(
            document.querySelectorAll(".menu__main label"),
        );
    }

    /**
     * 클래스 데코레이터를 수집하고 메뉴 객체를 생성합니다.
     */
    public beforeCollectClassDecorators() {
        const menuKeys = Object.keys(menu.ko);

        /**
         * 메뉴 재설정 (폐지 예정)
         * @deprecated
         */
        menuKeys.forEach((menuId) => {
            const items = Reflect.get(
                window,
                `${MENU_COMMAND}_${menuId}`,
                injectableMenuCommands[menuId],
            );

            menu.ko[menuId as MenuKeys] = {
                name: "",
                children: items?.children,
            };
        });

        // 수집된 메뉴 출력
        getMetadataStorage().menuCommands.forEach((menuCommand) => {
            const { menuId } = menuCommand;
            const id = menuId as MenuKeys;

            const items = Reflect.get(
                window,
                `${MENU_COMMAND}_${menuId}`,
                injectableMenuCommands[menuId],
            );

            menu.ko[id] = {
                name: menuCommand.name,
                children: {
                    ...items?.children,
                },
            } as Optional<IMenuItem>;
        });
    }

    /**
     * 메소드 데코레이터를 수집합니다.
     */
    public collectDecorators() {
        console.log("[after] collectDecorators");
        console.log(menu.ko);

        const shotcutService = getShotcutService();

        Object.values(menu.ko).forEach((item) => {
            if (item.children) {
                Object.keys(item.children).forEach((key: string) => {
                    const child = item.children?.[key] as any;
                    const menuChild =
                        typeof child === "function" ? child.prototype : child;

                    if (menuChild.action) {
                        const menuCommand =
                            getMetadataStorage().menuCommands.find(
                                (e) => e.name == key,
                            );
                        const shotcut = menuCommand?.shortcut;

                        if (shotcut && shotcut.length > 0) {
                            // "ctrl" 은 Mousetrap 의 "mod" 로 (macOS 는 Cmd, 그 외는 Ctrl).
                            // 브라우저가 가로채는 조합(Cmd+N/W/Q/T)이나 아직 스텁인 명령
                            // (복사/붙여넣기 등)까지 전역으로 묶으면 브라우저 기본 동작만 빼앗으므로
                            // 실제로 구현된 명령만 묶는다 (BINDABLE_MENU_SHORTCUTS).
                            if (!BINDABLE_MENU_SHORTCUTS.has(key)) {
                                return;
                            }
                            const combo = shotcut
                                .map((k) => (k === "ctrl" ? "mod" : k))
                                .join("+");
                            const action = menuChild.action as (
                                ev?: unknown,
                            ) => void;
                            shotcutService.bindEx(combo, (ev?: unknown) => {
                                action(ev);
                                // false 를 돌려주면 Mousetrap 이 preventDefault 한다
                                // (브라우저의 "페이지 저장" 같은 기본 동작 차단)
                                return false;
                            });
                        }
                    }
                });
            }
        });
    }

    public addMenuEventHandlers() {
        MenuButtonHandlers.addMinimizeWindow()
            .addMaximizeWindow()
            .addCloseWindow();
    }
}
