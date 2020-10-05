
import {EventEmitter} from "./EventEmitter.js";
import { Component } from "./Component.js";
import {MenuComponent} from "./MenuComponent.js";
import {TilesetMarker} from "./tilesetMarker.js";
import Tilemap from "./Tilemap.js";
import {toCamelCase} from "./camelCase.js"
import TilesetCanvas from "./TilesetCanvas.js";
import TileMarker from "./TileMarker.js";
import {config} from "./config.js";
import MenuService from "./MenuService.js";
import Rectangle from "./Rectangle.js";
import { WindowCreator } from "./WindowCreator.js";

export default class App extends EventEmitter {

    /**
     * 멤버 변수를 초기화합니다.
     */
    initMembers() {
        this.cache = {};
        this._config = config;
        this._mouse = {
            x: 0,
            y: 0, 
            screenX : 0,
            screenY : 0,
            buttons: {
                left: false,
                leftFire: false,
            },
            /**
             * @type {HTMLElement}
             */            
            target: null,
            /**
             * @type {HTMLElement}
             */                        
            menuTarget: null,
        };

        /**
         * 사각형 툴을 위한 선택 영역
         * @link http://jsfiddle.net/qGzkG/2/
         */
        this._blockRect = {
            isDrawing: false,
            rect: new Rectangle(0, 0, 1, 1),
        };
        this._now = performance.now();
        this._isMenuOpen = false;
        this._tileId = 0;
        this._isReady = false;

        // 타이틀을 변경합니다.
        document.title = "Initial Map Editor";

        this.emit("ready", JSON.stringify(this));
    }

    /**
     * 컴포넌트를 초기화합니다.
     */
    async initWithComponents() {
        /**
         * @type {Component[]}
         */
        this._components = [];
        this._components.push(this._menu = new MenuComponent(this._config));
        this._components.push(this._menuController = new MenuService(this._config, this._menu));

        this._tilesetCanvas = new TilesetCanvas(this._config);
        await this._tilesetCanvas.start().then(ret => {
            this._components.push(this._tilesetMarker = new TilesetMarker(this._config));                    
            this._components.push(this._tilemap = new Tilemap(this._config));    
            this._components.push(this._tileMarker = new TileMarker(this._config));    
            this._components.forEach(component => {
                component.start();
            });            
            this._tilemap.setTileId(0);
        }).then(ret => {
            $(".darken, .windows-container").css("left", "-9999px");
        }).catch(err => {
            console.warn(err);
        });
    }

    toCamelCase() {
        return toCamelCase();
    }

    isMobileDevice() {
        const ret = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return ret;
    }

    onMouseTouchMove(ev) {
        this._mouse.x = ev.layerX;
        this._mouse.y = ev.layerY;
        this._mouse.screenX = ev.layerX;
        this._mouse.screenY = ev.layerY;
    }

    /**
     * 마우스 이벤트 및 터치 이벤트를 초기화합니다.
     */
    initWithMouseEvent() {

        const isMobileDevice = this.isMobileDevice();
        let events;

        if(isMobileDevice) {
            events = {
                "touchmove": (ev) => {        
                    let touchEvent = ev;
                    if(ev.type.indexOf("touch") >= 0) {
                        touchEvent = ev.touches[0];
                    }                          
                    /**
                     * @type {HTMLElement}
                     */
                    const target = this._mouse.target;
                    const rect = this._mouse.target.getBoundingClientRect();

                    this._mouse.x = touchEvent.clientX - rect.x;
                    this._mouse.y = touchEvent.clientY - rect.y;
                    this._mouse.screenX = touchEvent.screenX;
                    this._mouse.screenY = touchEvent.screenY;
                },
                "touchstart pointerdown": (ev) => {
                    let touchEvent = ev;
                    if(ev.type.indexOf("touch") >= 0) {
                        touchEvent = ev.touches[0];
                    }
                    
                    this._mouse.target = ev.target; 

                    /**
                     * @type {HTMLElement}
                     */
                    const target = this._mouse.target;
                    const rect = this._mouse.target.getBoundingClientRect();

                    this._mouse.x = touchEvent.clientX - rect.x;
                    this._mouse.y = touchEvent.clientY - rect.y;
                    this._mouse.screenX = touchEvent.screenX;
                    this._mouse.screenY = touchEvent.screenY;           
                    this._mouse.buttons.left = true;
                    this._mouse.buttons.leftFire = false;                  
                },
                "touchend pointerup mouseup": (ev) => {
                    this._mouse.buttons.left = false;
                    this._mouse.buttons.leftFire = true; 
                }
            };

            $(window).on(events);

        } else {
            events = {
                "mousemove": (ev) => {
                    this._mouse.x = ev.layerX;
                    this._mouse.y = ev.layerY;
                    this._mouse.screenX = ev.layerX;
                    this._mouse.screenY = ev.layerY;
                },
                "mousedown": (ev) => {
                    if(ev.button == 0) {                 
                        this._mouse.buttons.left = true;
                        this._mouse.buttons.leftFire = false;
                        this._mouse.target = ev.target;
                    }
                },
                "mouseup": (ev) => {
                    if(ev.button == 0) {
                        this._mouse.buttons.left = false;
                        this._mouse.buttons.leftFire = true;

                        this._blockRect.isDrawing = false;
                    }
                },
                "mouseover": (ev) => {
                    if(this._menu._isMenuOpen) {
                        this._mouse.buttons.menuTarget = ev.target;
                        this._menu.emit("menu_open", this._mouse.buttons.menuTarget);
                    }
                }
            }         
            
            for(let k in events) {
                window.addEventListener(k, events[k], false);
            }                 
        }
  
    }

    setTileId(tileId) {
        if(!this._tilemap) return;
        this._tilemap.setTileId(tileId);
    }

    /**
     * 레이어를 토글하는 기능을 수행합니다.
     */
    initWithMapLayers() {
        const children = $("ul.aside__tabs__maptree-child-tree li i").children();
        let target = null;

        // 레이어 항목에서 눈 아이콘을 추가합니다.
        children.each((index, elem) => {
            const e = e.get(0);
            elem.click(() => {
                e.className = e.className.includes("slash") ? "far fa-eye":"far fa-eye-slash";
            });
        });

        // 레이어 항목에서 눈 아이콘을 누르면 눈을 감고 있는 아이콘(슬래쉬가 쳐진 아이콘)으로 토글합니다.
        $("ul.aside__tabs__maptree-child-tree li i").on("click", (ev) => {
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

        // 눈 아이콘을 선택했을 때 선택 영역을 강조하며 선택되지 않은 영역은 강조하지 않습니다.
        $("ul.aside__tabs__maptree-child-tree li").on("click", (ev) => {
            const elem = $(ev.currentTarget).css({
                "backgroundColor": "var(--dark-selection-color)"
            });
            $("ul.aside__tabs__maptree-child-tree li").not(elem).css({
                "backgroundColor": "rgba(255, 255, 255, 0)"
            });

            const layerId = elem.index();
            const tilemap = this._tilemap;

            // 타일맵을 지우고 다시 그립니다.
            tilemap.setCurrentLayerId(layerId);
            tilemap.clear();
            tilemap.draw();
            tilemap.updateAlphaLayers();
        });

        $("ul.aside__tabs__maptree-child-tree li:first-child").trigger("click");
    }

    start() {
        this.initMembers();
        this.initWithMouseEvent();

        // 모든 컴포넌트가 초기화된 이후 시점에 특정 작업을 수행합니다.
        this.initWithComponents()
            .then(ret => {
                this.initWithMapLayers();     
                this._isReady = true;       

                this.on("update", (deltaTime) => {
                    this.update(deltaTime);
                });
                
            }).catch(err => {
                console.warn(err);
                this._isReady = false;
            })
    }

    /**
     * 매 프레임마다 반복 실행되는 메소드입니다.
     * @param {Number}} deltaTime 
     */
    update(deltaTime) {

        if(!this._isReady) return;

        // 400ms가 지났을 때 마다 무언가를 실행합니다.
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
                case "contents__main-canvas":
                    if(this._mouse.buttons.left) {
                        this._tilemap.update(mouse);                                        
                    }
                    if(this._mouse.buttons.leftFire) {
                        this._tileMarker.update(mouse);    
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
        WindowCreator.onLoad(elem, id);
    }

    /**
     * @return {App}
     */
    static GetInstance() {
        if(!App.Instance) {
            App.Instance = new App();
        }
        
        return App.Instance;
    }
}

App.Instance = null;