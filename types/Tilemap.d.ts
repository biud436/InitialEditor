export default class Tilemap extends Component {
    constructor(...args: any[]);
    _config: any;
    _tileset: HTMLElement;
    _tileWidth: any;
    _tileHeight: any;
    _mapCols: any;
    _mapRows: any;
    _tileId: any;
    _mouseX: any;
    _mouseY: any;
    _currentLayer: any;
    _autoTileIndexedList: any[];
    _autoTileTextureList: {};
    _tileType: number;
    _mapWidth: number;
    _mapHeight: number;
    _layerCount: any;
    _data: string | any[];
    isMobileDevice(): boolean;
    initWithDrawingType(): void;
    _penType: number;
    initWithLayers(): void;
    setData(x: any, y: any, z: any, tileId: any): void;
    getData(x: any, y: any, z: any): any;
    setTileId(tileId: any): void;
    getTileId(): any;
    setCurrentLayerId(layerId: any): void;
    getCurrentLayerId(): any;
    _app: any;
    _layerContainer: any;
    _tilesets: any[];
    get app(): any;
    /**
     * TODO: 클립보드에 저장하는 방식으로 변환할 것.
     * @link https://developer.mozilla.org/ko/docs/Web/API/Clipboard/write
     */
    takeScreenshot(): void;
    onMouseMove(ev: any): void;
    /**
     * Get a tileset image from the tileset collection.
     */
    getTileset(): any;
    cropTexture(dx: any, dy: any, texture: any): any;
    collectAutoTileID(mx: any, my: any): number;
    drawTile(mx: any, my: any, tileID: any): void;
    _dirty: boolean;
    /**
     * Print tiles to certain area.
     * @param {Number} sx
     * @param {Number} sy
     * @param {Number} ex
     * @param {Number} ey
     * @param {Number} tileID
     */
    drawRect(sx: number, sy: number, ex: number, ey: number): void;
    isAutoTile(tileID: any): boolean;
    clear(): void;
    getTileCropTexture(tileID: any): any;
    toggleLayerVisibility(layerId: any): void;
    updateAlphaLayers(): void;
    draw(): void;
}
import { Component } from "./Component.js";
