import { Component } from "./Component";
import { MenuComponent } from "./MenuComponent";
import App from "./App";
import GamePropertiesWindowController from "./controllers/GamePropertiesWindowController";
import GamePropertiesWindow from "./models/GamePropertiesWindow";
import { WindowCreator } from "./WindowCreator";
import { KoreanMenu } from "./menu/KoreanMenu";
import { SIGKILL } from "constants";

const menu = {
    ko: KoreanMenu
};

export namespace InitialEditor {
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
            .querySelector(".menu .control-box li.minimum")
            .addEventListener("click", ev => {
                const { ipcRenderer } = require("electron");
                ipcRenderer.send("minimize");
                ev.stopImmediatePropagation();
            });

        return MenuButtonHandlers;
    }

    /**
     * 창 최대화
     */
    export function addMaximizeWindow() {
        document
            .querySelector(".menu .control-box li.maximum")
            .addEventListener("click", ev => {
                const { ipcRenderer } = require("electron");
                ipcRenderer.send("maximize");
                ev.stopImmediatePropagation();
            });

        return MenuButtonHandlers;
    }

    /**
     * 창 닫기
     */
    export function addCloseWindow() {
        document
            .querySelector(".menu .control-box li.close")
            .addEventListener("click", ev => {
                process.exit(SIGKILL);
            });

        return MenuButtonHandlers;
    }
}

/**
 * @class MenuService
 */
export default class MenuService extends Component {
    private _menuComponent: MenuComponent;
    private _isClickedMenu: boolean;

    initMembers(...args: any[]) {
        /**
         * @type {MenuComponent}
         */
        this._menuComponent = args[1];
        this._isClickedMenu = false;
    }

    start(...args: any[]) {
        // 맥 OS에서 내부 메뉴를 제거합니다.
        if (process.platform === "darwin") {
            (<HTMLDivElement>document.querySelector(".menu")).style.display =
                "none";
        }

        this.changeMenuLocaleAsPersonalize();
        this.changeToolbarIconOnMobileDevice();
        this.addMenuEventHandlers();

        return this;
    }

    changeMenuLocaleAsPersonalize() {
        const langCode = navigator.language.slice(0, 2);
        $(".menu__main label").each((index, elem) => {
            const parent = $(elem);
            const type = parent.data("action");
            // @ts-ignore
            const res = menu[langCode];
            if (res) {
                const data = res[type];
                const name = data.name;
                const font = res["$font"];
                parent.text(name);
                parent.css("font-size", font.size);

                $(`.menu__${type}-sub li`).each((_index, _elem) => {
                    const _node = $(_elem);

                    // 서브 메뉴의 위치를 세밀하게 조정합니다.
                    const menuNode = parent.parent();
                    _node
                        .parent()
                        .css(
                            "left",
                            menuNode.get(0).getBoundingClientRect().x + "px"
                        );

                    const _type = _node.data("action");
                    const _res = data.children[_type];
                    if (_res) {
                        // 메뉴 노드에 메뉴 액션을 등록합니다.
                        if (_res.action) {
                            _node.get(0).onclick = _res.action;
                        }

                        const _name = _res.name;
                        _node.get(0).childNodes.forEach(i => {
                            // 텍스트 노드만 찾습니다.
                            if (i.nodeType == 3) {
                                i.textContent = _name;
                            }
                        });
                        _node.css("font-size", font.size);
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

    changeToolbarIconOnMobileDevice() {
        const media = window.matchMedia("(max-width: 640px)");
        if (media.matches) {
            $(".toolbar i").each((index, elem) => {
                $(elem)
                    .addClass("fa-3x")
                    .css({
                        width: "98%",
                        height: "98%",
                        "font-size": "1.25em"
                    });
            });
        }

        const resizeConfig = {
            ".contents": {
                width: "65%"
            },
            ".aside__tabs": {
                width: "30%"
            },
            "#contents__main-canvas": {
                width: "100%"
            }
        };

        $(window).on("resize", () => {
            const width = window.innerWidth;
            const padding = window.outerWidth - window.innerWidth;

            if (width <= 640) {
                for (let i in resizeConfig) {
                    //@ts-ignore
                    $(i).css(resizeConfig[i]);

                    const elem = document.querySelector(i) as HTMLDivElement;
                }

                $(".toolbar i").each((index, elem) => {
                    $(elem)
                        .removeClass("fa-3x")
                        .addClass("fa-3x")
                        .css({
                            width: "98%",
                            height: "98%",
                            "font-size": "1.25em"
                        });
                });
            } else {
                $(".toolbar i").each((index, elem) => {
                    $(elem)
                        .removeClass("fa-3x")
                        .addClass("fa-sm")
                        .css({
                            width: "98%",
                            height: "98%",
                            "font-size": "0.875em"
                        });
                });
            }
        });
    }
}