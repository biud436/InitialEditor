var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Component } from "./component";
import * as PIXI from "pixi.js";
import { TilemapHistory } from "./TilemapHistory";
import { LayerTreeSchema } from "./schema/LayerTreeSchema";
import { Service } from "typedi";
import InitialDOM from "./utils/InitialDOM";
import { FileProvider } from "./schema";
import { PenType } from "./PenType";
import { ApplicationFactory } from "./graphics/ApplicationFactory";
export var initial2D;
(function (initial2D) {
    initial2D.TILESET_CANVAS_ID = "#view canvas";
    initial2D.MAIN_CANVAS_ID = "#contents__main-canvas";
})(initial2D || (initial2D = {}));
/**
 * @class Tilemap
 * @author biud436
 */
let Tilemap = class Tilemap extends Component {
    constructor() {
        super(...arguments);
        this._isHistoryEnabled = true;
        /**
         * 맵 레이어가 바뀌었을 때, 다른 레이어를 반투명하게 처리할 때 사용합니다.
         * 1.0 이면 불투명이며, 0.25 이면 반투명입니다.
         */
        this._semiTransparentOpacity = 1.0;
        this.fileProvider = new FileProvider();
        /** 현재 편집 중인 맵 문서의 메타데이터 (맵 포맷 v1 의 name, id 와 저장 경로) */
        this._mapName = "map1";
        this._mapId = 1;
        this._mapPath = null;
        this._backgroundGraphics = null;
        /**
         * 아직 에디터가 편집하지 못하지만 맵 파일에는 있는 데이터.
         * 불러온 그대로 들고 있다가 저장할 때 되돌려준다 (편집 못 한다고 지워버리면 데이터 손실이다).
         */
        this._collision = null;
        this._layerNames = [];
    }
    get mapWidth() {
        return this._mapWidth;
    }
    get mapHeight() {
        return this._mapHeight;
    }
    get layerCount() {
        return this._layerCount;
    }
    get tileWidth() {
        return this._tileWidth;
    }
    get tileHeight() {
        return this._tileHeight;
    }
    get mapName() {
        return this._mapName;
    }
    set mapName(value) {
        this._mapName = value;
    }
    get mapId() {
        return this._mapId;
    }
    set mapId(value) {
        this._mapId = value;
    }
    /** 브리지로 저장한(또는 불러온) 프로젝트 상대 경로. 아직 저장한 적이 없으면 null */
    get mapPath() {
        return this._mapPath;
    }
    set mapPath(value) {
        this._mapPath = value;
    }
    /** 평탄한 맵 데이터 원본 (data[z*W*H + y*W + x]). 내보내기 전용 — 수정하지 말 것 */
    getRawData() {
        return this._data;
    }
    /** 통행 레이어 (에디터는 아직 편집하지 못하고 보존만 한다). 길이는 width*height */
    getCollision() {
        return this._collision;
    }
    setCollision(collision) {
        this._collision =
            collision && collision.length === this._mapWidth * this._mapHeight
                ? collision.slice()
                : null;
    }
    /** 맵 파일의 레이어 이름 (없으면 빈 배열 → 저장할 때 layer1.. 로 채운다) */
    getLayerNames() {
        return this._layerNames;
    }
    setLayerNames(names) {
        this._layerNames = names.slice(0, this._config.LAYERS);
    }
    /**
     * 맵 크기를 바꾼다. 겹치는 영역의 타일은 유지하고 새 영역은 빈 칸(0)이 된다.
     * 히스토리는 새 크기 기준으로 다시 시작한다.
     */
    resize(width, height) {
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));
        if (width === this._mapWidth && height === this._mapHeight)
            return this;
        const layers = this._config.LAYERS;
        const next = new Array(width * height * layers).fill(0);
        const copyW = Math.min(width, this._mapWidth);
        const copyH = Math.min(height, this._mapHeight);
        for (let z = 0; z < layers; z++) {
            for (let y = 0; y < copyH; y++) {
                for (let x = 0; x < copyW; x++) {
                    next[width * height * z + width * y + x] = this.getData(x, y, z);
                }
            }
        }
        // 통행 레이어도 겹치는 영역만 옮긴다 (에디터가 편집하진 않지만 버리지도 않는다)
        let nextCollision = null;
        if (this._collision) {
            nextCollision = new Array(width * height).fill(0);
            for (let y = 0; y < copyH; y++) {
                for (let x = 0; x < copyW; x++) {
                    nextCollision[width * y + x] =
                        this._collision[this._mapWidth * y + x] ?? 0;
                }
            }
        }
        this._mapWidth = width;
        this._mapHeight = height;
        this._data = next;
        this._collision = nextCollision;
        this._history = new TilemapHistory(50);
        this.saveHistory();
        this.refreshBackground();
        this._dirty = true;
        return this;
    }
    /**
     * 맵 전체를 새 데이터로 바꾼다 (불러오기, 새 맵). data 길이는 width*height*LAYERS 여야 한다.
     */
    setRawData(width, height, data) {
        const layers = this._config.LAYERS;
        if (data.length !== width * height * layers) {
            throw new Error(`map data length ${data.length} != ${width}*${height}*${layers}`);
        }
        this._mapWidth = Math.max(1, Math.floor(width));
        this._mapHeight = Math.max(1, Math.floor(height));
        this._data = data.slice();
        // 새 데이터의 크기에 맞지 않는 통행 레이어와 레이어 이름은 호출자가 다시 넣는다
        this._collision = null;
        this._layerNames = [];
        this._history = new TilemapHistory(50);
        this.saveHistory();
        this.refreshBackground();
        this._dirty = true;
        return this;
    }
    /** 맵을 빈 칸으로 채운다 (새 맵) */
    clearMap() {
        this._data.fill(0);
        this._history = new TilemapHistory(50);
        this.saveHistory();
        this._dirty = true;
        return this;
    }
    /** 맵 크기가 바뀌면 검정 배경(컨테이너 크기 기준)을 다시 그린다 */
    refreshBackground() {
        if (!this._backgroundGraphics)
            return;
        const g = this._backgroundGraphics;
        g.clear();
        g.beginFill(0x000000);
        g.drawRect(0, 0, this._mapWidth * this._tileWidth, this._mapHeight * this._tileHeight);
        g.endFill();
    }
    initMembers(...args) {
        this._config = args[0];
        this._tileset = document.querySelector(initial2D.TILESET_CANVAS_ID);
        this._tileWidth = this._config.TILE_WIDTH;
        this._tileHeight = this._config.TILE_HEIGHT;
        this._mapCols = this._config.MAP_COLS;
        this._mapRows = this._config.MAP_ROWS;
        this._tileId = 0;
        this._mouseX = 0;
        this._mouseY = 0;
        this._currentLayer = 0;
        this._autoTileIndexedList = [];
        this._autoTileTextureList = {};
        // 1이면 오토타일, 0이면 일반 타일
        this._tileType = 0;
        this._mapWidth = Math.round(this._config.SCREEN_WIDTH / this._tileWidth);
        this._mapHeight = Math.round(this._config.SCREEN_HEIGHT / this._tileHeight);
        this._layerCount = this._config.LAYERS;
        this._data = new Array(this._mapWidth * this._mapHeight * this._config.LAYERS);
        // 히스토리 초기화
        this._history = new TilemapHistory(50);
        /**
         * @type {HTMLCanvasElement}
         */
        const tilesetImg = InitialDOM.query(initial2D.TILESET_CANVAS_ID);
        if (!tilesetImg) {
            throw new Error("Cant't find tileset");
        }
        Promise.resolve(this.load());
        this.active();
        this.initWithSaveEventListener();
    }
    async load() {
        await this.loadLayersConfig();
        await this.saveLayersConfig();
    }
    async loadLayersConfig() {
        const data = (await new LayerTreeSchema(this._config).load("./layers.json"));
        if (!data) {
            console.error("Failed to load layers.json");
            return;
        }
        const layerConfig = JSON.parse(data);
        this._semiTransparentOpacity = layerConfig.SemiTransparentOpacity;
    }
    /**
     * 레이어 설정 저장
     */
    async saveLayersConfig() {
        const layersConfig = new LayerTreeSchema(this._config);
        await layersConfig.toFile("./layers.json");
    }
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    /**
     * @internal
     */
    initWithSaveEventListener() {
        this.on("save", () => {
            const data = this._data.map((i) => (!!i ? i : 0));
            const layerData = {
                data,
            };
            const contents = JSON.stringify(layerData);
            this.fileProvider.writeFileSync("tilesets.json", contents, "utf8");
            alert("파일 저장이 완료되었습니다.");
        });
    }
    /**
     * Initialize with drawing type.
     */
    initWithDrawingType() {
        this._penType = PenType.PENCIL;
        this.on("drawingType", (penType) => {
            switch (penType) {
                case PenType.PENCIL:
                    console.log("펜 툴");
                    break;
                case PenType.RECTANGLE:
                    console.log("사각형 툴");
                    break;
                case PenType.ELLIPSE:
                    console.log("원형 툴");
                    break;
                case PenType.FLOOD_FILL:
                    console.log("채우기 툴");
                    break;
                case PenType.SHADOW_PEN:
                    console.log("그림자 툴");
                    break;
            }
            this._penType = penType;
        });
    }
    initWithLayers() {
        const maxZ = this._config.LAYERS;
        const maxWidth = Math.round(this._config.SCREEN_WIDTH / this._tileWidth);
        const maxHeight = Math.round(this._config.SCREEN_HEIGHT / this._tileHeight);
        for (let z = 0; z < maxZ; z++) {
            for (let y = 0; y < maxHeight; y++) {
                for (let x = 0; x < maxWidth; x++) {
                    this.setData(x, y, z, 0);
                }
            }
        }
        // 초기 상태를 히스토리에 저장
        this.saveHistory();
    }
    clamp(min, max) {
        return Math.min(Math.max(0, min), max);
    }
    /**
     * 현재 타일맵 상태를 히스토리에 저장합니다.
     */
    saveHistory() {
        if (this._isHistoryEnabled) {
            this._history.push(this._data);
        }
    }
    /**
     * 이전 상태로 되돌립니다.
     */
    undo() {
        const prevState = this._history.undo();
        if (prevState) {
            this._isHistoryEnabled = false;
            this._data = prevState;
            this._dirty = true;
            this.draw();
            this._isHistoryEnabled = true;
            return true;
        }
        return false;
    }
    /**
     * 다시 실행합니다.
     */
    redo() {
        const nextState = this._history.redo();
        if (nextState) {
            this._isHistoryEnabled = false;
            this._data = nextState;
            this._dirty = true;
            this.draw();
            this._isHistoryEnabled = true;
            return true;
        }
        return false;
    }
    /**
     * Undo가 가능한지 확인합니다.
     */
    canUndo() {
        return this._history.canUndo();
    }
    /**
     * Redo가 가능한지 확인합니다.
     */
    canRedo() {
        return this._history.canRedo();
    }
    setData(x, y, z, tileId) {
        if (x < 0)
            x = 0;
        if (x > this._mapWidth - 1)
            x = this._mapWidth - 1;
        y = this.clamp(y, this._mapHeight - 1);
        z = this.clamp(z, this._config.LAYERS - 1);
        const id = this.getLayeredTileId(x, y, z);
        this._data[id] = tileId;
    }
    getData(x, y, z) {
        if (x < 0)
            x = 0;
        if (x > this._mapWidth - 1)
            x = this._mapWidth - 1;
        y = this.clamp(y, this._mapHeight - 1);
        z = this.clamp(z, this._config.LAYERS - 1);
        const id = this.getLayeredTileId(x, y, z);
        return this._data[id] || 0;
    }
    setTileId(tileId) {
        this._tileId = tileId;
    }
    getTileId() {
        return this._tileId;
    }
    /**
     * 레이어의 Tile ID를 구합니다.
     * @param x
     * @param y
     * @param z
     * @returns
     */
    getLayeredTileId(x, y, z) {
        return this._mapWidth * this._mapHeight * z + this._mapWidth * y + x;
    }
    setCurrentLayerId(layerId) {
        this._currentLayer = layerId;
        return this;
    }
    getCurrentLayerId() {
        return this._currentLayer;
    }
    createOption() {
        let option = {
            width: this._config.SCREEN_WIDTH,
            height: this._config.SCREEN_HEIGHT,
            resolution: window.devicePixelRatio || 1,
            view: InitialDOM.query(initial2D.MAIN_CANVAS_ID),
            autoDensity: true,
            transparent: false,
            backgroundColor: 0x222222,
        };
        option.height =
            window.innerHeight -
                InitialDOM.query(".toolbar").clientHeight -
                30;
        option.width =
            window.innerWidth -
                InitialDOM.query(".aside__tabs").clientWidth -
                10;
        return option;
    }
    start(...args) {
        console.log("this._config", this._config);
        const option = this.createOption();
        this._app = ApplicationFactory.create(option);
        this.useDebugMode();
        this.createLayerContainer();
        this.createTilesetTexture();
        this.initWithDrawingType();
        const elem = InitialDOM.query("#take-screenshot");
        elem.onclick = (ev) => {
            this.takeScreenshot();
            ev.stopPropagation();
        };
        return this;
    }
    /**
     * 디버그 모드를 활성화합니다.
     *
     * 확장 툴을 받으면 개발자 도구에서 pixi.js 객체를 디버깅 할 수 있습니다.
     */
    useDebugMode() {
        globalThis.__PIXI_APP__ = this._app;
    }
    /**
     * 레이어 컨테이너를 생성합니다.
     */
    createLayerContainer() {
        // PIXI.Container는 어댑터 패턴으로 분리 필요
        this._layerContainer = new PIXI.Container();
        this._layerContainer.interactive = true;
        this._layerContainer.on("mousemove", this.onMouseMove.bind(this));
        this._layerContainer.on("pointermove", this.onMouseMove.bind(this));
        this.app.stage.addChild(this._layerContainer);
        this.createEmptyTilemap();
        for (let i = 0; i < this._config.LAYERS; i++) {
            this._layerContainer.addChild(new PIXI.Container());
        }
    }
    /**
     * 타일셋 텍스쳐를 생성합니다.
     */
    createTilesetTexture() {
        // 메인 타일셋
        this._tilesets = [];
        this._tilesets.push(PIXI.Texture.from(this._tileset));
    }
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
    createEmptyTilemap() {
        const defaultBackgroundColor = 0x000000;
        const realCanvasWidth = this._mapWidth * this._tileWidth;
        const realCanvasHeight = this._mapHeight * this._tileHeight;
        // Graphcs
        const graphics = new PIXI.Graphics();
        graphics.beginFill(defaultBackgroundColor);
        graphics.drawRect(0, 0, realCanvasWidth, realCanvasHeight);
        graphics.endFill();
        this._layerContainer.addChild(graphics);
        this._backgroundGraphics = graphics;
    }
    get app() {
        return this._app;
    }
    takeScreenshot() {
        const app = this._app;
        if (!app)
            return;
        /**
         * TODO: PIXI 의존성 분리 필요
         */
        app.renderer.plugins.extract.canvas(app.stage).toBlob((async (b) => {
            const arrayBuffer = await b.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (buffer) {
                // TODO: 파일 저장
            }
        }), "image/png");
    }
    onMouseMove(ev) {
        this._mouseX = ev.data.global.x;
        this._mouseY = ev.data.global.y;
    }
    /**
     * Get a tileset image from the tileset collection.
     */
    getTileset() {
        const tilesets = this._tileset;
        if (!tilesets) {
            throw new Error("Can't find the tileset from the memory.");
        }
        if (Array.isArray(tilesets) && tilesets.length <= 0) {
            throw new Error("The tileset image can't create correctly.");
        }
        return tilesets;
    }
    cropTexture(dx, dy, texture) {
        const crop = new PIXI.Rectangle(dx, dy, this._tileWidth, this._tileHeight);
        const cropTexture = new PIXI.Texture(texture.baseTexture, crop);
        return cropTexture;
    }
    collectAutoTileID(mx, my) {
        const mapX = this.getMapX(mx);
        const mapY = this.getMapY(my);
        const layerId = this._currentLayer;
        let mask = 0x00;
        const bits = [
            this.getData(mapX + 0, mapY - 1, layerId) <= 0, // 북
            this.getData(mapX + 1, mapY + 0, layerId) <= 0, // 동
            this.getData(mapX + 1, mapY - 1, layerId) <= 0, // 동북
            this.getData(mapX + 1, mapY + 1, layerId) <= 0, // 동남
            this.getData(mapX + 0, mapY + 1, layerId) <= 0, // 남
            this.getData(mapX - 1, mapY + 1, layerId) <= 0, // 남서
            this.getData(mapX - 1, mapY + 0, layerId) <= 0, // 서
            this.getData(mapX - 1, mapY - 1, layerId) <= 0, // 북서
        ];
        bits.forEach((e, i, a) => {
            if (e === true) {
                mask += 1 << i;
            }
        });
        return mask;
    }
    drawTile(mx, my, tileID) {
        let mapX = this.getMapX(mx);
        let mapY = this.getMapY(my);
        this.setData(mapX, mapY, this._currentLayer, tileID);
        this._dirty = true;
    }
    /**
     * 특정 영역에 타일을 사각형으로 그립니다.
     *
     * @param {Number} sx
     * @param {Number} sy
     * @param {Number} ex
     * @param {Number} ey
     * @param {Number} tileID
     */
    drawRect(sx, sy, ex, ey) {
        let mx = this.getMapX(sx);
        let my = this.getMapY(sy);
        const tileID = this._tileId;
        const width = mx + ex;
        const height = my + ey;
        for (let y = my; y < height; y++) {
            for (let x = mx; x < width; x++) {
                this.setData(x, y, this._currentLayer, tileID);
            }
        }
        this._dirty = true;
    }
    /**
     * 원 안에 있는지 확인합니다.
     * @param centerX
     * @param centerY
     * @param x
     * @param y
     * @param r
     */
    isInCircle(centerX, centerY, x, y, r) {
        const dist = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);
        return dist < r;
    }
    /**
     * 원을 그립니다.
     *
     * @param sx
     * @param sy
     * @param ex
     * @param ey
     */
    drawEllipse(sx, sy, ex, ey) {
        const mx = this.getMapX(sx);
        const my = this.getMapY(sy);
        const tileID = this._tileId;
        const width = Math.abs(ex);
        const height = Math.abs(ey);
        // 중심점 계산 (실제 타일 좌표)
        const centerX = mx + width / 2;
        const centerY = my + height / 2;
        // 타원의 반지름 (x축, y축)
        const radiusX = width / 2;
        const radiusY = height / 2;
        // 타일 범위 계산
        const startX = mx;
        const startY = my;
        const endX = mx + width;
        const endY = my + height;
        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                // 타원 방정식: ((x - centerX) / radiusX)^2 + ((y - centerY) / radiusY)^2 <= 1
                const normalizedX = (x + 0.5 - centerX) / radiusX;
                const normalizedY = (y + 0.5 - centerY) / radiusY;
                if (normalizedX * normalizedX + normalizedY * normalizedY <=
                    1) {
                    this.setData(x, y, this._currentLayer, tileID);
                }
            }
        }
        this._dirty = true;
    }
    /**
     * 오토 타일인 지 확인합니다.
     *
     * @param tileId
     */
    isAutoTile(tileId) {
        return this._autoTileIndexedList.indexOf(tileId) >= 0;
    }
    /**
     *
     * @link https://stackoverflow.com/a/40421933
     * @param hits
     * @param x
     * @param y
     * @param srcColor
     * @param tgtColor
     */
    floodFillDo(hits, x, y, srcColor, tgtColor) {
        if (y < 0)
            return false;
        if (x < 0)
            return false;
        if (y > this._mapHeight - 1)
            return false;
        if (x > this._mapWidth - 1)
            return false;
        if (hits[y][x])
            return false;
        if (this.getData(x, y, this._currentLayer) != srcColor)
            return false;
        this.setData(x, y, this._currentLayer, tgtColor);
        hits[y][x] = true;
        return true;
    }
    /**
     *
     * @link https://stackoverflow.com/a/40421933
     * @param x
     * @param y
     * @param startTileId
     * @param nodes
     * @param stack
     */
    floodFill(x, y, startTileId, nodes, stack) {
        const hits = [];
        for (let y = 0; y < this._mapHeight; y++) {
            hits[y] = [];
            for (let x = 0; x < this._mapWidth; x++) {
                hits[y][x] = false;
            }
        }
        const queue = new Array();
        let srcColor = 0;
        let targetColor = 1;
        if (startTileId == -1) {
            srcColor = this.getData(x, y, this._currentLayer);
        }
        targetColor = this._tileId;
        queue.push({ x, y });
        while (queue.length !== 0) {
            const p = queue.shift();
            if (this.floodFillDo(hits, p.x, p.y, srcColor, targetColor)) {
                queue.push({ x: p.x, y: p.y - 1 });
                queue.push({ x: p.x, y: p.y + 1 });
                queue.push({ x: p.x - 1, y: p.y });
                queue.push({ x: p.x + 1, y: p.y });
            }
        }
    }
    getMapX(value) {
        return Math.floor(value / this._tileWidth);
    }
    canvasToMapX(value) {
        return value / this._tileWidth;
    }
    getMapY(value) {
        return Math.floor(value / this._tileHeight);
    }
    canvasToMapY(value) {
        return value / this._tileHeight;
    }
    /**
     * 업데이트 함수는 마우스 왼쪽 버튼이 눌렸을 때에만 호출됩니다.
     */
    update(...args) {
        const penType = this._penType;
        const tileId = this._tileId;
        // 오토 타일을 처리합니다.
        // if(this.isAutoTile(tileId)) {
        //     this._tileId = this.collectAutoTileID(this._mouseX, this._mouseY);
        //     this._tileset = this._autoTileTextureList[tileId];
        //     this._tileType = 1;
        // } else {
        //     this._tileType = 0;
        // }
        // 펜 타입에 따라 그리기 처리를 합니다.
        switch (penType) {
            case PenType.PENCIL:
                this.drawTile(this._mouseX, this._mouseY, tileId);
                break;
            case PenType.RECTANGLE:
                {
                    const mouse = args[0];
                    this.drawRect(mouse.startX, mouse.startY, this.canvasToMapX(mouse.x - mouse.startX), this.canvasToMapY(mouse.y - mouse.startY));
                }
                break;
            case PenType.ELLIPSE:
                // https://stackoverflow.com/a/46630005
                {
                    const mouse = args[0];
                    if (mouse.dragTime >= 8) {
                        this.drawEllipse(mouse.startX, mouse.startY, this.canvasToMapX(mouse.x - mouse.startX), this.canvasToMapY(mouse.y - mouse.startY));
                    }
                }
                break;
            case PenType.FLOOD_FILL:
                {
                    const mouse = args[0];
                    let mx = this.getMapX(this._mouseX);
                    let my = this.getMapY(this._mouseY);
                    let nodes = [];
                    this.floodFill(mx, my, -1, nodes, 0);
                    this._dirty = true;
                }
                break;
            case PenType.SHADOW_PEN:
                break;
        }
        // 타일맵 배열에 변화가 있을 경우, 새로 그리기 처리를 합니다.
        if (this._dirty) {
            this.draw();
            this._dirty = false;
        }
    }
    /**
     * 모든 타일 스프라이트를 화면에서 제거합니다.
     *
     */
    clear() {
        if (!this._layerContainer)
            return this;
        if (!this._layerContainer.children)
            return this;
        this._layerContainer.children.forEach((i) => {
            i.removeChildren();
        });
        return this;
    }
    /**
     * 타일셋 이미지에서 특정 영역만 가져와 잘라냅니다.
     *
     * @param tileID
     */
    getTileCropTexture(tileID) {
        const texture = PIXI.Texture.from(this._tileset);
        const mapCols = this.getMapX(texture.width);
        const mapRows = this.getMapY(texture.height);
        const dx = (tileID % mapCols) * this._tileWidth;
        const dy = Math.floor(tileID / mapCols) * this._tileHeight;
        const cropTexture = this.cropTexture(dx, dy, texture);
        return cropTexture;
    }
    /**
     * 특정 레이어 컨테이너를 화면에서 감추거나 표시합니다.
     *
     * @param layerId
     */
    toggleLayerVisibility(layerId) {
        if (!this._layerContainer)
            return;
        const children = this._layerContainer.children;
        children[layerId].visible = !children[layerId].visible;
    }
    /**
     * 레이어의 투명도를 조절합니다.
     */
    updateAlphaLayers() {
        if (!this._config)
            return this;
        const currentLayer = this._currentLayer;
        const children = this._layerContainer.children;
        const layers = children.filter((e, i, a) => {
            return i !== currentLayer;
        });
        const semiTransparentOpacity = this._semiTransparentOpacity;
        layers.forEach((layer) => {
            layer.alpha = semiTransparentOpacity;
        });
        children[currentLayer].alpha = 1.0;
        return this;
    }
    draw() {
        if (!this._config)
            return this;
        // 화면에 있는 모든 타일 스프라이트를 없앱니다.
        this.clear();
        const mapWidth = this._mapWidth;
        const mapHeight = this._mapHeight;
        // 레이어 Z부터 반복하여 모든 타일을 반복하여 그립니다.
        for (let z = 0; z < this._config.LAYERS; z++) {
            const container = this._layerContainer.children[z];
            for (let y = 0; y < mapHeight; y++) {
                for (let x = 0; x < mapWidth; x++) {
                    const tileID = this.getData(x, y, z);
                    if (!tileID)
                        continue;
                    const sprite = new PIXI.Sprite(this.getTileCropTexture(tileID));
                    sprite.x = x * this._tileWidth;
                    sprite.y = y * this._tileHeight;
                    container.addChild(sprite);
                }
            }
        }
        return this;
    }
};
Tilemap = __decorate([
    Service()
], Tilemap);
export default Tilemap;
//# sourceMappingURL=tilemap.js.map