declare class App extends EventEmitter {
    /**
     * @return {App}
     */
    static GetInstance(): App;
    /**
     * 멤버 변수를 초기화합니다.
     */
    initMembers(): void;
    cache: {};
    _config: {
        SCREEN_WIDTH: number;
        SCREEN_HEIGHT: number;
        TILE_WIDTH: number;
        TILE_HEIGHT: number;
        MAP_COLS: number;
        MAP_ROWS: number;
        LAYERS: number;
        TRANSPARENT_COLOR_GROUP: string[];
        TILESET_IMGAGES: string[];
        Editor: import("./schema/EditorSchema.js").EditorSchema;
        Maps: import("./schema/EditorSchema.js").EditorSchema;
    };
    _mouse: {
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
    /**
     * 사각형 툴을 위한 선택 영역
     * @link http://jsfiddle.net/qGzkG/2/
     */
    _blockRect: {
        isDrawing: boolean;
        rect: Rectangle;
    };
    _now: any;
    _isMenuOpen: boolean;
    _tileId: number;
    _isReady: boolean;
    /**
     * Creates all components.
     */
    createComponents(): void;
    _tilesetMarker: TilesetMarker;
    _tilemap: Tilemap;
    _tileMarker: TileMarker;
    /**
     * 컴포넌트를 초기화합니다.
     */
    initWithComponents(): Promise<void>;
    /**
     * @type {Component[]}
     */
    _components: Component[];
    _menu: MenuComponent;
    _menuController: MenuService;
    _tilesetCanvas: TilesetCanvas;
    toCamelCase(): any;
    isMobileDevice(): boolean;
    onMouseTouchMove(ev: any): void;
    /**
     * 마우스 이벤트 및 터치 이벤트를 초기화합니다.
     */
    initWithMouseEvent(): void;
    setTileId(tileId: any): void;
    /**
     * 레이어를 토글하는 기능을 수행합니다.
     */
    initWithMapLayers(): void;
    start(): void;
    /**
     * 매 프레임마다 반복 실행되는 메소드입니다.
     * @param {Number}} deltaTime
     */
    update(deltaTime: any): void;
    updateComponents(): void;
    /**
     *
     * @param {HTMLElement} elem
     * @param {Number} id
     */
    onLoad(elem: HTMLElement, id: number): void;
}
declare namespace App {
    const Instance: any;
}
export default App;
import { EventEmitter } from "./EventEmitter.js";
import Rectangle from "./Rectangle.js";
import { TilesetMarker } from "./tilesetMarker.js";
import Tilemap from "./Tilemap.js";
import TileMarker from "./TileMarker.js";
import { Component } from "./Component.js";
import { MenuComponent } from "./MenuComponent.js";
import MenuService from "./MenuService.js";
import TilesetCanvas from "./TilesetCanvas.js";
