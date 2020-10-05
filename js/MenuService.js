import {Component} from "./Component.js";
import {MenuComponent} from "./MenuComponent.js";
import App from "./App.js";
import GamePropertiesWindowController from "./controllers/GamePropertiesWindowController.js";
import GamePropertiesWindow from "./models/GamePropertiesWindow.js";
import { WindowCreator } from "./WindowCreator.js";
import {KoreanMenu} from "./menu/KoreanMenu.js";

const menu = {
    "ko": KoreanMenu,
};

export default class MenuService extends Component {

    initMembers(...args) {

        /**
         * @type {MenuComponent}
         */
        this._menuComponent = args[1];
        this._isClickedMenu = false;        
    }

    start(...args) {

        this.changeMenuLocaleAsPersonalize();
        this.changeToolbarIconOnMobileDevice();
        this.addMenuEventHandlers();
    }    

    changeMenuLocaleAsPersonalize() {
        const langCode = navigator.language.slice(0, 2);
        $(".menu__main label").each((index, elem) => {
            const parent = $(elem);
            const type = parent.data("action");
            const res = menu[langCode];
            if(res) {
                const data = res[type];
                const name = data.name;
                const font = res["$font"];
                parent.text(name);
                parent.css("font-size", font.size);

                $(`.menu__${type}-sub li`)
                    .each((_index, _elem) => {
                        const _node = $(_elem);
                        
                        // 서브 메뉴의 위치를 세밀하게 조정합니다.
                        const menuNode = parent.parent();
                        _node.parent().css("left", menuNode.get(0).getBoundingClientRect().x + "px");

                        const _type = _node.data("action");
                        const _res = data.children[_type];
                        if(_res) {

                            // 메뉴 노드에 메뉴 액션을 등록합니다.
                            if(_res.action) {
                                _node.get(0).onclick = _res.action;
                            }

                            const _name = _res.name;
                            _node.get(0).childNodes.forEach(i => {
                                // 텍스트 노드만 찾습니다.
                                if(i.nodeType == 3) {
                                    i.textContent = _name;
                                }
                            });
                            _node.css("font-size", font.size);
                        }
                    })                

            }
        })
    }

    addMenuEventHandlers() {

        // 창 최소화
        $(".menu .control-box li.minimum").on("click", ev => {
            const { ipcRenderer } = require('electron') ;
            ipcRenderer.send('minimize');
            ev.stopImmediatePropagation();
        });   

        // 창 최대화
        $(".menu .control-box li.maximum").on("click", ev => {
            const { ipcRenderer } = require('electron') ;
            ipcRenderer.send('maximize');
            ev.stopImmediatePropagation();
        });              

        // 창 닫기
        $(".menu .control-box li.close").on("click", ev => {
            window.close();
            ev.stopImmediatePropagation();
        });                
    }

    changeToolbarIconOnMobileDevice() {
        const media = window.matchMedia("(max-width: 640px)");
        if(media.matches) {
            $(".toolbar i").each((index, elem) => {
                $(elem)
                    .addClass("fa-3x")
                    .css({
                        "width": "98%",
                        "height": "98%",
                        "font-size": "1.25em"
                    })
            })
        }

        const resizeConfig = {
            ".contents": {
                "width": "65%",
            },
            ".aside__tabs": {
                "width": "30%",
            },
            "#contents__main-canvas": {
                "width": "100%",
            }
        }

        $(window).on("resize", () => {

            if($(window).width() <= 640) {
                for(let i in resizeConfig) {
                    $(i).css(resizeConfig[i]);
                }

                $(".toolbar i").each((index, elem) => {
                    $(elem)
                        .removeClass("fa-3x")                    
                        .addClass("fa-3x")
                        .css({
                            "width": "98%",
                            "height": "98%",
                            "font-size": "1.25em"
                        })
                })                
            } else {
                $(".toolbar i").each((index, elem) => {
                    $(elem)
                        .removeClass("fa-3x") 
                        .addClass("fa-sm")                   
                        .css({
                            "width": "98%",
                            "height": "98%",
                            "font-size": "0.875em"
                        })
                })  
            }
        })
    }
}