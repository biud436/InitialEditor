import { Component } from "./Component";
import { config } from "./config";
import * as PIXI from "pixi.js";
import { Mouse } from "./Mouse";
import { LayerTreeSchema } from "./schema/LayerTreeSchema";
import * as fs from "fs";

export namespace initial2D {
    export const TILESET_CANVAS_ID = "#view canvas";
    export const MAIN_CANVAS_ID = "#contents__main-canvas";
}

enum PenType {
    PENCIL = 0,
    RECTANGLE,
    ELLIPSE,
    FLOOD_FILL,
    SHADOW_PEN,
}

interface TilemapPoint {
    x: number;
    y: number;
}

/**
 * @class Tilemap
 * @author biud436
 */
export default class Tilemap extends Component {
    private _config: typeof config;

    private _tileset: HTMLCanvasElement;
    private _tileWidth: number;
    private _tileHeight: number;

    private _mapCols: number;
    private _mapRows: number;

    private _tileId: number;
    private _mouseX: number;
    private _mouseY: number;
    private _currentLayer: number;
    private _autoTileIndexedList: number[];

    private _autoTileTextureList: {};
    private _tileType: number;

    private _mapWidth: number;
    private _mapHeight: number;

    private _layerCount: number;

    private _data: number[];
    private _penType: number;
    private _app: PIXI.Application;
    private _layerContainer: PIXI.Container;
    private _tilesets: PIXI.Texture[];
    private _dirty: boolean;

    private _semiTransparentOpacity = 0.25;

    public initMembers(...args: any[]) {
        this._config = args[0];
        this._tileset = <HTMLCanvasElement>(
            $(initial2D.TILESET_CANVAS_ID).get(0)
        );
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

        this._mapWidth = Math.round(
            this._config.SCREEN_WIDTH / this._tileWidth
        );
        this._mapHeight = Math.round(
            this._config.SCREEN_HEIGHT / this._tileHeight
        );
        this._layerCount = this._config.LAYERS;

        this._data = new Array(
            this._mapWidth * this._mapHeight * this._config.LAYERS
        );

        /**
         * @type {HTMLCanvasElement}
         */
        const tilesetImg = <HTMLCanvasElement>(
            $(initial2D.TILESET_CANVAS_ID).get(0)
        );
        if (!tilesetImg) {
            throw new Error("Cant't find tileset");
        }

        this._mapCols = Math.floor(tilesetImg.width / this._tileWidth);
        this._mapRows = Math.floor(tilesetImg.width / this._tileWidth);

        Promise.resolve(this.load());
        this.active();
        this.initWithSaveEventListener();
    }

    public async load() {
        await this.loadLayersConfig();
        await this.saveLayersConfig();
    }

    public async loadLayersConfig() {
        const data = <string>(
            await new LayerTreeSchema(this._config).load("./layers.json")
        );
        if (!data) {
            return;
        }

        const layerConfig: LayerTreeSchema = JSON.parse(data);

        this._semiTransparentOpacity = layerConfig.SemiTransparentOpacity;
    }

    /**
     * 레이어 설정 저장
     */
    public async saveLayersConfig() {
        const layersConfig = new LayerTreeSchema(this._config);
        await layersConfig.toFile("./layers.json");
    }

    public isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        );
    }

    /**
     * @internal
     */
    protected initWithSaveEventListener() {
        this.on("save", () => {
            const path = require("path");
            const data = this._data.map((i) => (!!i ? i : 0));

            const layerData = {
                data,
            };

            const contents = JSON.stringify(layerData);

            fs.writeFileSync(path.resolve("tilesets.json"), contents, "utf8");

            alert("파일 저장이 완료되었습니다.");
        });
    }

    /**
     * Initialize with drawing type.
     */
    public initWithDrawingType() {
        this._penType = PenType.PENCIL;

        this.on("drawingType", (penType: number) => {
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

    public initWithLayers() {
        const maxZ = this._config.LAYERS;
        const maxWidth = Math.round(
            this._config.SCREEN_WIDTH / this._tileWidth
        );
        const maxHeight = Math.round(
            this._config.SCREEN_HEIGHT / this._tileHeight
        );

        for (let z = 0; z < maxZ; z++) {
            for (let y = 0; y < maxHeight; y++) {
                for (let x = 0; x < maxWidth; x++) {
                    this.setData(x, y, z, 0);
                }
            }
        }
    }

    public clamp(min: number, max: number) {
        return Math.min(Math.max(0, min), max);
    }

    public setData(x: number, y: number, z: number, tileId: number) {
        if (x < 0) x = 0;
        if (x > this._mapWidth - 1) x = this._mapWidth - 1;
        y = this.clamp(y, this._mapHeight - 1);
        z = this.clamp(z, this._config.LAYERS - 1);

        const id = this.getLayeredTileId(x, y, z);
        this._data[id] = tileId;
    }

    public getData(x: number, y: number, z: number) {
        if (x < 0) x = 0;
        if (x > this._mapWidth - 1) x = this._mapWidth - 1;
        y = this.clamp(y, this._mapHeight - 1);
        z = this.clamp(z, this._config.LAYERS - 1);

        const id = this.getLayeredTileId(x, y, z);
        return this._data[id] || 0;
    }

    public setTileId(tileId: number) {
        this._tileId = tileId;
    }

    public getTileId() {
        return this._tileId;
    }

    /**
     * 레이어의 Tile ID를 구합니다.
     * @param x
     * @param y
     * @param z
     * @returns
     */
    public getLayeredTileId(x: number, y: number, z: number) {
        return this._mapWidth * this._mapHeight * z + this._mapWidth * y + x;
    }

    public setCurrentLayerId(layerId: number): Tilemap {
        this._currentLayer = layerId;

        return this;
    }

    public getCurrentLayerId() {
        return this._currentLayer;
    }

    public start(...args: any[]) {
        let option = {
            width: this._config.SCREEN_WIDTH,
            height: this._config.SCREEN_HEIGHT,
            backgroundColor: 0x00000000,
            resolution: window.devicePixelRatio || 1,
            view: <HTMLCanvasElement>$(initial2D.MAIN_CANVAS_ID).get(0),
            autoDensity: true,
            transparent: false,
        };

        option.height =
            $(window).innerHeight() - $(".toolbar").innerHeight() - 30;
        option.width =
            $(window).innerWidth() - $(".aside__tabs").innerWidth() - 10;

        this._app = new PIXI.Application(option);

        // Create layer container.
        this._layerContainer = new PIXI.Container();
        this._layerContainer.interactive = true;
        this._layerContainer.on("mousemove", this.onMouseMove.bind(this));
        this._layerContainer.on("pointermove", this.onMouseMove.bind(this));
        this.app.stage.addChild(this._layerContainer);

        for (let i = 0; i < this._config.LAYERS; i++) {
            this._layerContainer.addChild(new PIXI.Container());
        }

        // 메인 타일셋
        this._tilesets = [];
        this._tilesets.push(PIXI.Texture.from(this._tileset));

        this.initWithDrawingType();

        $("#take-screenshot").on("click", (ev) => {
            this.takeScreenshot();

            ev.stopPropagation();
        });

        return this;
    }

    get app() {
        return this._app;
    }

    public takeScreenshot() {
        const app = this._app;
        if (!app) return;

        app.renderer.extract.canvas(app.stage).toBlob(async (b: Blob) => {
            const arrayBuffer = await b.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (buffer) {
                const res = await fs.promises.writeFile(
                    Date.now() + ".png",
                    buffer
                );
                console.log(res);
            }
        }, "image/png");
    }

    private onMouseMove(ev: any) {
        this._mouseX = ev.data.global.x;
        this._mouseY = ev.data.global.y;
    }

    /**
     * Get a tileset image from the tileset collection.
     */
    public getTileset() {
        const tilesets = this._tileset;

        if (!tilesets) {
            throw new Error("Can't find the tileset from the memory.");
        }

        if (Array.isArray(tilesets) && tilesets.length <= 0) {
            throw new Error("The tileset image can't create correctly.");
        }

        return tilesets;
    }

    public cropTexture(dx: number, dy: number, texture: PIXI.Texture) {
        const crop = new PIXI.Rectangle(
            dx,
            dy,
            this._tileWidth,
            this._tileHeight
        );
        const cropTexture = new PIXI.Texture(texture.baseTexture, crop);

        return cropTexture;
    }

    public collectAutoTileID(mx: number, my: number) {
        const mapX = this.getMapX(mx);
        const mapY = this.getMapX(my);
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

    public drawTile(mx: number, my: number, tileID: number) {
        let mapX = this.getMapX(mx);
        let mapY = this.getMapX(my);

        console.log(mx, my, mapX, mapY);

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
    public drawRect(sx: number, sy: number, ex: number, ey: number) {
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
    public isInCircle(
        centerX: number,
        centerY: number,
        x: number,
        y: number,
        r: number
    ) {
        let dist = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);
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
    public drawEllipse(sx: number, sy: number, ex: number, ey: number) {
        let mx = this.getMapX(sx);
        let my = this.getMapY(sy);

        const tileID = this._tileId;

        const width = mx + ex;
        const height = my + ey;
        const centerX = Math.floor(mx + ex / 2);
        const centerY = Math.floor(my + ey / 2);
        const r = Math.sqrt(
            Math.pow(ex - centerX, 2) + Math.pow(ey - centerY, 2)
        );

        for (let y = my; y < height; y++) {
            for (let x = mx; x < width; x++) {
                if (this.isInCircle(centerX, centerY, x, y, r)) {
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
    public isAutoTile(tileId: number) {
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
    public floodFillDo(
        hits: boolean[][],
        x: number,
        y: number,
        srcColor: number,
        tgtColor: number
    ) {
        if (y < 0) return false;
        if (x < 0) return false;
        if (y > this._mapHeight - 1) return false;
        if (x > this._mapWidth - 1) return false;

        if (hits[y][x]) return false;

        if (this.getData(x, y, this._currentLayer) != srcColor) return false;

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
    public floodFill(
        x: number,
        y: number,
        startTileId: number,
        nodes: any[],
        stack: number
    ) {
        const hits: boolean[][] = [];

        for (let y = 0; y < this._mapHeight; y++) {
            hits[y] = [];
            for (let x = 0; x < this._mapWidth; x++) {
                hits[y][x] = false;
            }
        }

        const queue: TilemapPoint[] = new Array();

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

    public getMapX(value: number | 0) {
        return Math.floor(value / this._tileWidth);
    }

    public canvasToMapX(value: number | 0) {
        return value / this._tileWidth;
    }

    public getMapY(value: number | 0) {
        return Math.floor(value / this._tileHeight);
    }

    public canvasToMapY(value: number | 0) {
        return value / this._tileHeight;
    }

    /**
     * 업데이트 함수는 마우스 왼쪽 버튼이 눌렸을 때에만 호출됩니다.
     */
    public update(...args: any[]) {
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
                    const mouse: Mouse = args[0];
                    this.drawRect(
                        mouse.startX,
                        mouse.startY,
                        this.canvasToMapX(mouse.x - mouse.startX),
                        this.canvasToMapY(mouse.y - mouse.startY)
                    );
                }
                break;
            case PenType.ELLIPSE:
                // https://stackoverflow.com/a/46630005
                {
                    const mouse: Mouse = args[0];
                    if (mouse.dragTime >= 8) {
                        this.drawEllipse(
                            mouse.startX,
                            mouse.startY,
                            this.canvasToMapX(mouse.x - mouse.startX),
                            this.canvasToMapY(mouse.y - mouse.startY)
                        );
                    }
                }
                break;
            case PenType.FLOOD_FILL:
                {
                    const mouse = <Mouse>args[0];

                    let mx = this.getMapX(this._mouseX);
                    let my = this.getMapY(this._mouseY);
                    let nodes: TilemapPoint[] = [];
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
    public clear(): Tilemap {
        this._layerContainer.children.forEach((i) => {
            (<PIXI.Sprite>i).removeChildren();
        });

        return this;
    }

    /**
     * 타일셋 이미지에서 특정 영역만 가져와 잘라냅니다.
     *
     * @param tileID
     */
    public getTileCropTexture(tileID: number) {
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
    public toggleLayerVisibility(layerId: number) {
        if (!this._layerContainer) return;
        const children = this._layerContainer.children;
        children[layerId].visible = !children[layerId].visible;
    }

    /**
     * 레이어의 투명도를 조절합니다.
     */
    public updateAlphaLayers(): Tilemap {
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

    public draw(): Tilemap {
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
                    if (!tileID) continue;
                    const sprite = new PIXI.Sprite(
                        this.getTileCropTexture(tileID)
                    );
                    sprite.x = x * this._tileWidth;
                    sprite.y = y * this._tileHeight;
                    (<PIXI.Sprite>container).addChild(sprite);
                }
            }
        }

        return this;
    }
}
