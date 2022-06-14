import { Component } from "./component";
import * as PIXI from "pixi.js";
export declare namespace initial2D {
    const TILESET_CANVAS_ID = "#view canvas";
    const MAIN_CANVAS_ID = "#contents__main-canvas";
}
/**
 * @class Tilemap
 * @author biud436
 */
export default class Tilemap extends Component {
    private _config;
    private _tileset;
    private _tileWidth;
    private _tileHeight;
    private _mapCols;
    private _mapRows;
    private _tileId;
    private _mouseX;
    private _mouseY;
    private _currentLayer;
    private _autoTileIndexedList;
    private _autoTileTextureList;
    private _tileType;
    private _mapWidth;
    private _mapHeight;
    private _layerCount;
    private _data;
    private _penType;
    private _app;
    private _layerContainer;
    private _tilesets;
    private _dirty;
    private _semiTransparentOpacity;
    initMembers(...args: any[]): void;
    load(): Promise<void>;
    loadLayersConfig(): Promise<void>;
    /**
     * 레이어 설정 저장
     */
    saveLayersConfig(): Promise<void>;
    isMobileDevice(): boolean;
    /**
     * @internal
     */
    protected initWithSaveEventListener(): void;
    /**
     * Initialize with drawing type.
     */
    initWithDrawingType(): void;
    initWithLayers(): void;
    clamp(min: number, max: number): number;
    setData(x: number, y: number, z: number, tileId: number): void;
    getData(x: number, y: number, z: number): number;
    setTileId(tileId: number): void;
    getTileId(): number;
    /**
     * 레이어의 Tile ID를 구합니다.
     * @param x
     * @param y
     * @param z
     * @returns
     */
    getLayeredTileId(x: number, y: number, z: number): number;
    setCurrentLayerId(layerId: number): Tilemap;
    getCurrentLayerId(): number;
    start(...args: any[]): this;
    get app(): PIXI.Application;
    takeScreenshot(): void;
    private onMouseMove;
    /**
     * Get a tileset image from the tileset collection.
     */
    getTileset(): HTMLCanvasElement;
    cropTexture(dx: number, dy: number, texture: PIXI.Texture): PIXI.Texture;
    collectAutoTileID(mx: number, my: number): number;
    drawTile(mx: number, my: number, tileID: number): void;
    /**
     * 특정 영역에 타일을 사각형으로 그립니다.
     *
     * @param {Number} sx
     * @param {Number} sy
     * @param {Number} ex
     * @param {Number} ey
     * @param {Number} tileID
     */
    drawRect(sx: number, sy: number, ex: number, ey: number): void;
    /**
     * 원 안에 있는지 확인합니다.
     * @param centerX
     * @param centerY
     * @param x
     * @param y
     * @param r
     */
    isInCircle(centerX: number, centerY: number, x: number, y: number, r: number): boolean;
    /**
     * 원을 그립니다.
     *
     * @param sx
     * @param sy
     * @param ex
     * @param ey
     */
    drawEllipse(sx: number, sy: number, ex: number, ey: number): void;
    /**
     * 오토 타일인 지 확인합니다.
     *
     * @param tileId
     */
    isAutoTile(tileId: number): boolean;
    /**
     *
     * @link https://stackoverflow.com/a/40421933
     * @param hits
     * @param x
     * @param y
     * @param srcColor
     * @param tgtColor
     */
    floodFillDo(hits: boolean[][], x: number, y: number, srcColor: number, tgtColor: number): boolean;
    /**
     *
     * @link https://stackoverflow.com/a/40421933
     * @param x
     * @param y
     * @param startTileId
     * @param nodes
     * @param stack
     */
    floodFill(x: number, y: number, startTileId: number, nodes: any[], stack: number): void;
    getMapX(value: number | 0): number;
    canvasToMapX(value: number | 0): number;
    getMapY(value: number | 0): number;
    canvasToMapY(value: number | 0): number;
    /**
     * 업데이트 함수는 마우스 왼쪽 버튼이 눌렸을 때에만 호출됩니다.
     */
    update(...args: any[]): void;
    /**
     * 모든 타일 스프라이트를 화면에서 제거합니다.
     *
     */
    clear(): Tilemap;
    /**
     * 타일셋 이미지에서 특정 영역만 가져와 잘라냅니다.
     *
     * @param tileID
     */
    getTileCropTexture(tileID: number): PIXI.Texture;
    /**
     * 특정 레이어 컨테이너를 화면에서 감추거나 표시합니다.
     *
     * @param layerId
     */
    toggleLayerVisibility(layerId: number): void;
    /**
     * 레이어의 투명도를 조절합니다.
     */
    updateAlphaLayers(): Tilemap;
    draw(): Tilemap;
}
