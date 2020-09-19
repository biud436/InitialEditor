import GamePropertiesWindowController from "./renderer.js";
import { Component } from "./component.js";
import {MenuComponent} from "./menu_component.js";
import {TilesetMarker} from "./tileset_marker.js";
import Tilemap from "./tilemap.js";
import GamePropertiesWindow from "./model/gamePropertiesWindow.js";
import toCamelCase from "./camelCase.js"
import TilesetCanvas from "./TilesetCanvas.js";

export default class App {

    /**
     * 멤버 변수를 초기화합니다.
     */
    initMembers() {
        this.cache = {};
        this._mouse = {
            x: 0,
            y: 0,
            screenX : 0,
            screenY : 0,
            buttons: {
                left: false,
                leftFire: false,
            },
            target: null,
        };
        this._now = performance.now();
        this._isMenuOpen = false;
        this._tileId = 0;
        this._isReady = false;
        document.title = "Initial Map Editor";
    }

    /**
     * 컴포넌트를 초기화합니다.
     */
    async initWithComponents() {
        /**
         * @type {Component[]}
         */
        this._components = [];
        this._components.push(this._menu = new MenuComponent());

        this._tilesetCanvas = new TilesetCanvas();
        await this._tilesetCanvas.start().then(ret => {
            this._components.push(this._tilesetMarker = new TilesetMarker());                    
            this._components.push(this._tilemap = new Tilemap());    
            this._components.forEach(component => {
                component.start();
            });            
            this._tilemap.setTileId(0);
        }).catch(err => {
            console.warn(err);
        });
    }

    toCamelCase() {
        return toCamelCase();
    }

    /**
     * 마우스 이벤트 및 터치 이벤트를 초기화합니다.
     */
    initWithMouseEvent() {

        window.addEventListener("mousemove", (ev) => {
            /**
             * position을 적용한 Element를 기준으로 한 좌표
             */
            this._mouse.x = ev.layerX;
            this._mouse.y = ev.layerY;
            /**
             * 모니터를 기준으로 한 마우스 좌표
             */
            this._mouse.screenX = ev.layerX;
            this._mouse.screenY = ev.layerY;
        }, false);

        window.addEventListener("mousedown", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = true;
                this._mouse.buttons.leftFire = false;
                this._mouse.target = ev.target;
            }
        }, false);

        window.addEventListener("mouseup", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = false;
                this._mouse.buttons.leftFire = true;
            }
        }, false);

        window.addEventListener("touchstart", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = true;
            }
        }, false);        

        window.addEventListener("touchend", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = false;
            }
        }, false);      

    }

    setTileId(tileId) {
        if(!this._tilemap) return;
        this._tilemap.setTileId(tileId);
    }

    /**
     * 창을 동적으로 렌더링합니다.
     */
    initWithGamePropertiesWindow() {

        // 게임 속성 창 생성하기
        this._gamePropertiesWindow = new GamePropertiesWindowController(new GamePropertiesWindow());

        // 동적으로 HTML 과 CSS 데이터를 가져옵니다.
        this._gamePropertiesWindow.render()
            .then(ret => {

                // 로딩이 성공적으로 완료되었다면 창 데이터를 현재 렌더러에 캐시합니다.
                this.cache["new-window"] = this._gamePropertiesWindow;

                $(`.file-menu-new-button`).on("click", (ev) => {
                    // 창을 화면에 보이게 합니다.
                    this._gamePropertiesWindow.show();
                    // 펼쳐진 메뉴를 다시 접습니다.
                    $("#none").prop("checked", true);
                })

            })
            .catch(err => {
                console.warn(err);
            });
    }

    initWithMapLayers() {
        const children = $("ul.child-tree li i").children();
        let target = null;
        children.each((index, elem) => {
            const e = e.get(0);
            elem.click(() => {
                e.className = e.className.includes("slash") ? "far fa-eye":"far fa-eye-slash";
            });
        });

        $("ul.child-tree li i").on("click", (ev) => {
            const target = $(ev.currentTarget);
            const parentNode = $(ev.currentTarget).parent();
            const layerId = parentNode.index();
            const tilemap = this._tilemap;

            if(target.hasClass("fa-eye")) {
                target.removeClass("fa-eye")
                    .addClass("fa-eye-slash");
            } else {
                target.removeClass("fa-eye-slash")
                    .addClass("fa-eye");                
            }

            tilemap.toggleLayerVisibility(layerId);
        });

        $("ul.child-tree li").on("click", (ev) => {
            const elem = $(ev.currentTarget).css({
                "backgroundColor": "var(--dark-selection-color)"
            });
            $("ul.child-tree li").not(elem).css({
                "backgroundColor": "rgba(255, 255, 255, 0)"
            });

            const layerId = elem.index();
            const tilemap = this._tilemap;

            tilemap.setCurrentLayerId(layerId);
            tilemap.clear();
            tilemap.draw();
            tilemap.updateAlphaLayers();
        });

        $("ul.child-tree li:first-child").trigger("click");
    }

    start() {
        this.initMembers();
        this.initWithMouseEvent();
        this.initWithComponents().then(ret => {
            this.initWithGamePropertiesWindow();
        }).then(ret => {
            this.initWithMapLayers();     
            this._isReady = true;       
        }).catch(err => {
            console.warn(err);
        })
    }

    /**
     * 매 프레임마다 반복 실행되는 메소드입니다.
     * @param {Number}} deltaTime 
     */
    update(deltaTime) {

        if(!this._isReady) return;

        // 400ms가 지났을 때 마다 무언가를 실행한다.
        if(deltaTime - this._now >= 400) {
            this._now = deltaTime;
        }

        this.updateComponents();

        this._mouse.buttons.leftFire = false;
    }

    updateComponents() {        
        const target = this._mouse.target;

        if(!target) {
            return;
        }
        
        const id = target.id;
        const mouse = this._mouse;

        this._menu.update(target, mouse);

        if(!this._menu.isMenuOpen()) {
            switch(id) {
                case "tileset-canvas":
                case "view":
                    if(this._mouse.buttons.leftFire) {
                        this._tilesetMarker.update(mouse);
                    }
                    break;
                case "main-canvas":
                    if(this._mouse.buttons.left) {
                        this._tilemap.update(mouse);
                    }
                    break;
            }
        }

    }

    /**
     * 
     * @param {HTMLElement} elem 
     * @param {Number} id 
     */
    onLoad(elem, id) {
        if(this.cache[id]) {
            const self = this.cache[id];
            this.cache[id].onLoad(elem, self);
        }
    }

    static GetInstance() {
        if(!App.Instance) {
            App.Instance = new App();
        }
        
        return App.Instance;
    }
}

App.Instance = null;