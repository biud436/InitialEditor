import {
    Component
} from "./Component";
import {config} from "./config";
import * as PIXI from "pixi.js";

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

    initMembers(...args: any[]) {
        this._config = args[0];
        this._tileset = (<HTMLCanvasElement>$("#view canvas").get(0));
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
        
        /**
         * @type {HTMLCanvasElement}
         */
        const tilesetImg = $("#view canvas").get(0);
        if(!tilesetImg) {
            throw new Error("Cant't find tileset");
        }
        
        this._mapCols = Math.floor(((tilesetImg as HTMLCanvasElement).width) / this._tileWidth);
        this._mapRows = Math.floor(((tilesetImg as HTMLCanvasElement).width) / this._tileWidth);    
        
        this.active();
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    initWithDrawingType() {
        this._penType = 0;
        $("#pen-tool").on("click", () => {
            this._penType = 0;
            console.log("펜");
        });
        $("#square-tool").on("click", () => {
            this._penType = 1;
            console.log("사각형");
        });
    }

    initWithLayers() {
        const maxZ = this._config.LAYERS;
        const maxWidth = Math.round(this._config.SCREEN_WIDTH / this._tileWidth);
        const maxHeight = Math.round(this._config.SCREEN_HEIGHT / this._tileHeight);        

        for(let z = 0; z < maxZ; z++) {
            for(let y = 0; y < maxHeight; y++) {
                for(let x = 0; x < maxWidth; x++) {
                    this.setData(x, y, z, 0);
                }
            }
        }
    }

    setData(x :number, y: number, z: number, tileId: number) {
        if(x < 0) x = 0;
        if(x > this._mapWidth - 1) x = this._mapWidth - 1;
        y = Math.min(Math.max(0, y), this._mapHeight - 1);
        z = Math.min(Math.max(0, z), this._config.LAYERS - 1);

        const id = (this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x;
        this._data[id] = tileId;
    }

    getData(x: number, y: number, z: number) {
        if(x < 0) x = 0;
        if(x > this._mapWidth - 1) x = this._mapWidth - 1;
        y = Math.min(Math.max(0, y), this._mapHeight - 1);        
        z = Math.min(Math.max(0, z), this._config.LAYERS - 1);

        const id = (this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x;
        return this._data[id] || 0;
    }

    setTileId(tileId: number) {
        this._tileId = tileId;
    }

    getTileId() {
        return this._tileId;
    } 

    setCurrentLayerId(layerId: number) {
        this._currentLayer = layerId;
    }

    getCurrentLayerId() {
        return this._currentLayer;
    }

    start(...args: any[]) {

        let option = {
            width: this._config.SCREEN_WIDTH,
            height: this._config.SCREEN_HEIGHT,
            backgroundColor: 0x00000000,
            resolution: window.devicePixelRatio || 1,
            view: $("#contents__main-canvas").get(0) as HTMLCanvasElement,
            autoDensity: true,
            transparent: false,
        };

        option.height = $(window).innerHeight() - $(".toolbar").innerHeight() - 30;
        option.width = $(window).innerWidth() - $(".aside__tabs").innerWidth() - 10;

        this._app = new PIXI.Application(option);

        this._layerContainer = new PIXI.Container();
        this._layerContainer.interactive = true;
        this._layerContainer.on("mousemove", this.onMouseMove.bind(this));
        this._layerContainer.on("pointermove", this.onMouseMove.bind(this));
        this.app.stage.addChild(this._layerContainer);   

        for(let i = 0; i < this._config.LAYERS; i++) {
            this._layerContainer.addChild(new PIXI.Container());   
        }

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

    /**
     * TODO: 클립보드에 저장하는 방식으로 변환할 것.
     * @link https://developer.mozilla.org/ko/docs/Web/API/Clipboard/write
     */
    takeScreenshot() {
        const app = this._app;
        if(!app) return;
        app.renderer.extract.canvas(app.stage).toBlob((b) => {
            const a = document.createElement('a');
            document.body.append(a);
            a.download = 'screenshot';
            a.href = URL.createObjectURL(b);
            a.onclick = function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
            };
            a.click();
            a.remove();

        }, 'image/png');        
    }

    onMouseMove(ev: any) {
        this._mouseX = ev.data.global.x;
        this._mouseY = ev.data.global.y;
    }

    /**
     * Get a tileset image from the tileset collection.
     */
    getTileset()  {
        const tilesets = this._tileset;

        if(!tilesets) {
            throw new Error("Can't find the tileset from the memory.");
        }

        if(Array.isArray(tilesets) && tilesets.length <= 0) {
            throw new Error("The tileset image can't create correctly.");
        }

        return tilesets;
    }
    
    cropTexture(dx: number, dy: number, texture: PIXI.Texture) {
        const crop = new PIXI.Rectangle(dx, dy, this._tileWidth, this._tileHeight);
        const cropTexture = new PIXI.Texture(texture.baseTexture, crop);
        
        return cropTexture;
    }

    collectAutoTileID(mx: number, my: number) {
        const mapX = Math.floor(mx / this._tileWidth);
        const mapY = Math.floor(my / this._tileHeight);
        const layerId = this._currentLayer;
        let mask = 0x00;
        const bits = [
            this.getData(mapX + 0, mapY - 1, layerId) <= 0, // 북
            this.getData(mapX + 1, mapY - 1, layerId) <= 0, // 동북
            this.getData(mapX + 1, mapY + 0, layerId) <= 0, // 동
            this.getData(mapX + 1, mapY + 1, layerId) <= 0, // 동남
            this.getData(mapX + 0, mapY + 1, layerId) <= 0, // 남
            this.getData(mapX - 1, mapY + 1, layerId) <= 0, // 남서
            this.getData(mapX - 1, mapY + 0, layerId) <= 0, // 서
            this.getData(mapX - 1, mapY - 1, layerId) <= 0 // 북서
        ];

        bits.forEach((e, i, a) => {
            if(e === true) {
                mask += (1 << i);
            }
        });

        return mask;
    }    

    drawTile(mx: number, my: number, tileID: number) {
        let mapX = Math.floor(mx / this._tileWidth);
        let mapY = Math.floor(my / this._tileHeight);

        console.log(mx, my, mapX, mapY);

        this.setData(mapX, mapY, this._currentLayer, tileID);

        this._dirty = true;
    }

    /**
     * Print tiles to certain area.
     * @param {Number} sx 
     * @param {Number} sy 
     * @param {Number} ex 
     * @param {Number} ey 
     * @param {Number} tileID 
     */
    drawRect(sx: number, sy: number, ex: number, ey: number) {

        let mx = Math.floor(sx / this._tileWidth);
        let my = Math.floor(sy / this._tileHeight);       

        const tileID = this._tileId;
        
        const width = mx + ex;
        const height = my + ey;

        for(let y = my; y < height; y++) {
            for(let x = mx; x < width; x++) {
                this.setData(x, y, this._currentLayer, tileID);
            }
        }        

        this._dirty = true;
    }

    isAutoTile(tileId: number) {
        return this._autoTileIndexedList.indexOf(tileId) >= 0;
    }

    update(...args: any[]) {
        const penType = this._penType;
        const tileId = this._tileId;

        // if(this.isAutoTile(tileId)) {
        //     this._tileId = this.collectAutoTileID(this._mouseX, this._mouseY);
        //     this._tileset = this._autoTileTextureList[tileId];
        //     this._tileType = 1;
        // } else {
        //     this._tileType = 0;
        // }

        switch(penType) {
            case 0: 
                this.drawTile(this._mouseX, this._mouseY, tileId);
                break;
            case 1:
                this.drawRect(this._mouseX, this._mouseY, 20, 5);
                break;
        }
  
        if(this._dirty) {
            this.draw();
            this._dirty = false;
        }
    }

    clear() {
        this._layerContainer.children.forEach(i => {
            (i as PIXI.Sprite).removeChildren();
        });
    }

    getTileCropTexture(tileID: number) {
        let texture = PIXI.Texture.from(this._tileset);
        const mapCols = Math.floor(texture.width / this._tileWidth);
        const mapRows = Math.floor((texture.height) / this._tileHeight);
        const dx = (tileID % mapCols) * this._tileWidth;
        const dy = Math.floor(tileID / mapCols) * this._tileHeight;        
        const cropTexture = this.cropTexture(dx, dy, texture);

        return cropTexture;
    }

    toggleLayerVisibility(layerId: number) {
        if(!this._layerContainer) return;
        const children = this._layerContainer.children;
        children[layerId].visible = !children[layerId].visible;
    }

    updateAlphaLayers() {
        const currentLayer = this._currentLayer;
        const children = this._layerContainer.children;
        const layers = children.filter((e, i, a) => {
            return i !== currentLayer;
        });

        layers.forEach(layer => {
            layer.alpha = 0.25;
        });

        children[currentLayer].alpha = 1.0;
    }

    draw() {        
        this.clear();

        const mapWidth = this._mapWidth;
        const mapHeight = this._mapHeight;

        for(let z = 0; z < this._config.LAYERS; z++) {
            const container = this._layerContainer.children[z];
            for(let y = 0; y < mapHeight; y++) {
                for(let x = 0; x < mapWidth; x++) {
                    const tileID = this.getData(x, y, z);
                    if(!tileID) continue;
                    const sprite = new PIXI.Sprite(this.getTileCropTexture(tileID));
                    sprite.x = x * this._tileWidth;
                    sprite.y = y * this._tileHeight;
                    (container as PIXI.Sprite).addChild(sprite);
                }
            }
        }

    }

}
