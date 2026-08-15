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
    private _history;
    private _isHistoryEnabled;
    /**
     * 맵 레이어가 바뀌었을 때, 다른 레이어를 반투명하게 처리할 때 사용합니다.
     * 1.0 이면 불투명이며, 0.25 이면 반투명입니다.
     */
    private _semiTransparentOpacity;
    private readonly fileProvider;
    /** 현재 편집 중인 맵 문서의 메타데이터 (맵 포맷 v1 의 name, id 와 저장 경로) */
    private _mapName;
    private _mapId;
    private _mapPath;
    private _backgroundGraphics;
    /**
     * 아직 에디터가 편집하지 못하지만 맵 파일에는 있는 데이터.
     * 불러온 그대로 들고 있다가 저장할 때 되돌려준다 (편집 못 한다고 지워버리면 데이터 손실이다).
     */
    private _collision;
    private _layerNames;
    get mapWidth(): number;
    get mapHeight(): number;
    get layerCount(): number;
    get tileWidth(): number;
    get tileHeight(): number;
    get mapName(): string;
    set mapName(value: string);
    get mapId(): number;
    set mapId(value: number);
    /** 브리지로 저장한(또는 불러온) 프로젝트 상대 경로. 아직 저장한 적이 없으면 null */
    get mapPath(): string | null;
    set mapPath(value: string | null);
    /** 평탄한 맵 데이터 원본 (data[z*W*H + y*W + x]). 내보내기 전용 — 수정하지 말 것 */
    getRawData(): ReadonlyArray<number>;
    /** 통행 레이어 (에디터는 아직 편집하지 못하고 보존만 한다). 길이는 width*height */
    getCollision(): number[] | null;
    setCollision(collision: number[] | null): void;
    /** 맵 파일의 레이어 이름 (없으면 빈 배열 → 저장할 때 layer1.. 로 채운다) */
    getLayerNames(): string[];
    setLayerNames(names: string[]): void;
    /**
     * 맵 크기를 바꾼다. 겹치는 영역의 타일은 유지하고 새 영역은 빈 칸(0)이 된다.
     * 히스토리는 새 크기 기준으로 다시 시작한다.
     */
    resize(width: number, height: number): Tilemap;
    /**
     * 맵 전체를 새 데이터로 바꾼다 (불러오기, 새 맵). data 길이는 width*height*LAYERS 여야 한다.
     */
    setRawData(width: number, height: number, data: number[]): Tilemap;
    /** 맵을 빈 칸으로 채운다 (새 맵) */
    clearMap(): Tilemap;
    /** 맵 크기가 바뀌면 검정 배경(컨테이너 크기 기준)을 다시 그린다 */
    private refreshBackground;
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
    /**
     * 현재 타일맵 상태를 히스토리에 저장합니다.
     */
    private saveHistory;
    /**
     * 이전 상태로 되돌립니다.
     */
    undo(): boolean;
    /**
     * 다시 실행합니다.
     */
    redo(): boolean;
    /**
     * Undo가 가능한지 확인합니다.
     */
    canUndo(): boolean;
    /**
     * Redo가 가능한지 확인합니다.
     */
    canRedo(): boolean;
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
    createOption(): Partial<PIXI.IApplicationOptions>;
    start(...args: any[]): this;
    /**
     * 디버그 모드를 활성화합니다.
     *
     * 확장 툴을 받으면 개발자 도구에서 pixi.js 객체를 디버깅 할 수 있습니다.
     */
    private useDebugMode;
    /**
     * 레이어 컨테이너를 생성합니다.
     */
    private createLayerContainer;
    /**
     * 타일셋 텍스쳐를 생성합니다.
     */
    private createTilesetTexture;
    /**
     * 빈 검정 타일맵을 생성합니다.
     *
     * pixi.js@^5 와 pixi.js@^6에서는 빈 타일맵을 생성하지 않아도 그려집니다.
     * 하지만 pixi.js@^7는 달랐습니다.
     *
     * 컨테이너에는 컨텐츠가 있어야 width와 height가 설정되는 것 같습니다.
     *
     * 따라서 빈 그래픽을 그려서 컨테이너의 크기를 설정하였습니다.
     */
    private createEmptyTilemap;
    get app(): PIXI.Application<PIXI.ICanvas>;
    takeScreenshot(): void;
    private onMouseMove;
    /**
     * Get a tileset image from the tileset collection.
     */
    getTileset(): HTMLCanvasElement;
    cropTexture(dx: number, dy: number, texture: PIXI.Texture): PIXI.Texture<PIXI.Resource>;
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
    getTileCropTexture(tileID: number): PIXI.Texture<PIXI.Resource>;
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
