
import {EventEmitter} from "./EventEmitter";
import { Component } from "./Component";
import {MenuComponent} from "./MenuComponent";
import {TilesetMarker} from "./tilesetMarker";
import Tilemap from "./Tilemap";
import {toCamelCase} from "./camelCase"
import TilesetCanvas from "./TilesetCanvas";
import TileMarker from "./TileMarker";
import {config} from "./config";
import MenuService from "./MenuService";
import Rectangle from "./Rectangle";
import { WindowCreator } from "./WindowCreator";
import {Toolbar, ToolbarManager} from "./toolbar/Toolbar";
import {ElectronService} from "./ElectronService";

interface Mouse {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    buttons: {
        left: boolean;
        leftFire: boolean;
    };
    /**
     * @type {HTMLElement}
     */
    target: HTMLElement;
    /**
     * @type {HTMLElement}
     */
    menuTarget: HTMLElement;
}

interface BlockRect {
    isDrawing: boolean;
    rect: Rectangle;  
}

export default class App extends EventEmitter {

    public static Instance: App = null;

    private cache: {};
    private _config: {
        SCREEN_WIDTH: number;
        SCREEN_HEIGHT: number;
        TILE_WIDTH: number;
        TILE_HEIGHT: number;
        MAP_COLS: number;
        MAP_ROWS: number;
        LAYERS: number;
        TRANSPARENT_COLOR_GROUP: string[];
        TILESET_IMGAGES: string[];
        Editor: import("./schema/EditorSchema").EditorSchema;
        Maps: import("./schema/EditorSchema").EditorSchema;
    };
    private _mouse: {
        x: number;
        y: number;
        screenX: number;
        screenY: number;
        buttons: {
            left: boolean;
            leftFire: boolean;
        };
        /**
         * @type {HTMLElement}
         */
        target: HTMLElement;
        /**
         * @type {HTMLElement}
         */
        menuTarget: HTMLElement;
    };
    private _blockRect: {
        isDrawing: boolean;
        rect: Rectangle;
    };
    private _now: any;
    private _isMenuOpen: boolean;
    private _tileId: number;
    private _isReady: boolean;
    private _tilesetMarker: TilesetMarker;
    private _tilemap: Tilemap;
    private _tileMarker: TileMarker;   
    private _components: Component[];
    private _menu: MenuComponent;
    private _menuController: MenuService;  
    private _tilesetCanvas: TilesetCanvas;       

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
     * 컴포넌트를 생성합니다.
     */
    createComponents() {
        this._tilemap = new Tilemap(this._config);

        this._components.push(this._tilesetMarker = new TilesetMarker(this._config));                    
        this._components.push(this._tilemap);    
        this._components.push(this._tileMarker = new TileMarker(this._config));    
        this._components.forEach(component => {
            component.start();
        });            
        this._tilemap.setTileId(0);

        // 타일맵 이벤트를 재전파합니다.
        this.on("tilemap", (...args: any) => {
            this._tilemap.emit(args[0], ...args.slice(1));
        });
    }

    /**
     * 컴포넌트를 초기화합니다.
     */
    async initWithComponents(): Promise<void> {
        /**
         * @type {Component[]}
         */
        this._components = [];
        this._components.push(this._menu = new MenuComponent(this._config));
        this._components.push(this._menuController = new MenuService(this._config, this._menu));

        this._tilesetCanvas = new TilesetCanvas(this._config);
        await this._tilesetCanvas.start().then(ret => {
            this.createComponents();
        }).then(ret => {
            $(".darken, .windows-container").css("left", "-9999px");
        }).catch(err => {
            console.warn(err);
        });
    }

    toCamelCase() {
        return toCamelCase();
    }

    /**
     * 모바일 디바이스에서 실행하고 있는지 여부를 파악합니다.
     * @return {Boolean}
     */
    isMobileDevice(): Boolean {
        const ret = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return ret;
    }

    onMouseTouchMove(ev: any) {
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
                "touchmove": (ev: any) => {        
                    let touchEvent = ev;
                    if(ev.type.indexOf("touch") >= 0) {
                        touchEvent = ev.touches[0];
                    }                          
                    /**
                     * @type {HTMLElement}
                     */
                    const target = this._mouse.target;
                    const rect = this._mouse.target.getBoundingClientRect();

                    // 현재 선택된 타겟 요소를 기반으로 마우스의 시작 좌표를 정확히 계산합니다.
                    this._mouse.x = touchEvent.clientX - rect.x;
                    this._mouse.y = touchEvent.clientY - rect.y;
                    this._mouse.screenX = touchEvent.screenX;
                    this._mouse.screenY = touchEvent.screenY;
                },
                "touchstart pointerdown": (ev: any) => {
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
                "touchend pointerup mouseup": (ev: any) => {
                    this._mouse.buttons.left = false;
                    this._mouse.buttons.leftFire = true; 
                }
            };

            $(window).on(events);

        } else {
            events = {
                "mousemove": (ev: any) => {
                    this._mouse.x = ev.layerX;
                    this._mouse.y = ev.layerY;
                    this._mouse.screenX = ev.layerX;
                    this._mouse.screenY = ev.layerY;
                },
                "mousedown": (ev: any) => {
                    if(ev.button == 0) {                 
                        this._mouse.buttons.left = true;
                        this._mouse.buttons.leftFire = false;
                        this._mouse.target = ev.target;
                    }
                },
                "mouseup": (ev: any) => {
                    if(ev.button == 0) {
                        this._mouse.buttons.left = false;
                        this._mouse.buttons.leftFire = true;

                        this._blockRect.isDrawing = false;
                    }
                },
                "mouseover": (ev: any) => {
                    if(this._menu._isMenuOpen) {
                        //@ts-ignore
                        this._mouse.buttons.menuTarget = ev.target;
                        //@ts-ignore
                        this._menu.emit("menu_open", this._mouse.buttons.menuTarget);
                    }
                }
            }         
            
            for(let k in events) {
                //@ts-ignore
                window.addEventListener(k, events[k], false);
            }                 
        }
  
    }

    setTileId(tileId: number) {
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
        children.each((index: number, elem: HTMLLIElement) => {
            // @ts-ignore
            const e = e.get(0);
            // @ts-ignore
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
            tilemap.setCurrentLayerId(layerId)
                   .clear()
                   .draw()
                   .updateAlphaLayers();
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

                this.on("update", (deltaTime: number) => {
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
    update(deltaTime: number) {

        if(!this._isReady) return;

        // 400ms가 지났을 때 마다 무언가를 실행합니다.
        if(deltaTime - this._now >= 400) {
            this._now = deltaTime;
        }

        this.updateComponents();

        this._mouse.buttons.leftFire = false;
    }

    /**
     * 컴포넌트를 업데이트 합니다.
     */
    updateComponents() {        
        const target = this._mouse.target;

        if(!target) {
            return;
        }
        
        const id = target.id;
        const mouse = this._mouse;

        // 메뉴를 업데이트합니다.
        this._menu.update(target, mouse);

        // 메뉴가 열리지 않았을 경우
        if(!this._menu.isMenuOpen()) {
            switch(id) {
                case "tileset-canvas":
                case "view":
                    // * 마우스 왼쪽 버튼을 눌렀다 뗐을 때
                    if(this._mouse.buttons.leftFire) {
                        // 타일셋 마커를 표시합니다.
                        this._tilesetMarker.update(mouse);
                    }
                    break;
                case "contents__main-canvas":
                    // * 마우스 왼쪽 버튼을 누르고 있을 때
                    if(this._mouse.buttons.left) {
                        // 타일셋을 업데이트합니다.
                        this._tilemap.update(mouse);                                        
                    }
                    // * 마우스 왼쪽 버튼을 눌렀다 뗐을 때
                    if(this._mouse.buttons.leftFire) {
                        // 타일 마커의 위치를 변경합니다.
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
    onLoad(elem: HTMLElement, id: number): void {
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