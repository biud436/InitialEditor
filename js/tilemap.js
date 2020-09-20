// //@ts-check
import {
    Component
} from "./component.js";

export default class Tilemap extends Component {

    initMembers(...args) {
        this._config = args[0];
        this._tileset = $("#view canvas").get(0);
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

        if(!(this._data = localStorage.getItem("tileMapData"))) {
            this._data = new Array(this._mapWidth * this._mapHeight * this._config.LAYERS);
        }
        
        const tilesetImg = $("#view canvas").get(0);
        if(!tilesetImg) {
            throw new Error("Cant't find tileset");
        }
        
        this._mapCols = Math.floor((tilesetImg.width) / this._tileWidth);
        this._mapRows = Math.floor((tilesetImg.width) / this._tileWidth);    
        
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

    setData(x, y, z, tileId) {
        if(x < 0) x = 0;
        if(x > this._mapWidth - 1) x = this._mapWidth - 1;
        y = Math.min(Math.max(0, y), this._mapHeight - 1);
        z = Math.min(Math.max(0, z), this._config.LAYERS - 1);

        const id = (this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x;
        console.log((this._mapWidth * y) + x);
        this._data[id] = tileId;
    }

    getData(x, y, z) {
        x = Math.min(Math.max(0, x), this._mapWidth);
        y = Math.min(Math.max(0, y), this._mapHeight);        
        z = Math.min(Math.max(0, z), this._config.LAYERS);

        const id = (this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x;
        return this._data[id] || 0;
    }

    setTileId(tileId) {
        this._tileId = tileId;
    }

    getTileId() {
        return this._tileId;
    } 

    setCurrentLayerId(layerId) {
        this._currentLayer = layerId;
    }

    getCurrentLayerId() {
        return this._currentLayer;
    }

    start() {

        let option = {
            width: this._config.SCREEN_WIDTH,
            height: this._config.SCREEN_HEIGHT,
            // backgroundColor: 0x00000000,
            resolution: window.devicePixelRatio || 1,
            view: $("#contents__main-canvas").get(0),
            autoDensity: true,
            transparent: false,
        };

        // $(`#contents__main-canvas`).resizable();

        // if(this.isMobileDevice()) {
            option.height = $(window).innerHeight() - $(".toolbar").innerHeight() - 30;
            option.width = $(window).innerWidth() - $(".aside__tile-tab-control").innerWidth() - 10;
        // }

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

        $("#take-screenshot").on("click", () => this.takeScreenshot());

    }

    get app() {
        return this._app;
    }

    takeScreenshot() {
        const app = this._app;
        if(!app) return;
        app.renderer.extract.canvas(app.stage).toBlob((b) => {
            const a = document.createElement('a');
            document.body.append(a);
            a.download = 'screenshot';
            a.href = URL.createObjectURL(b);
            a.click();
            a.remove();
        }, 'image/png');        
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

        if(!tilesets) {
            throw new Error("Can't find the tileset from the memory.");
        }

        if(Array.isArray(tilesets) && tilesets.length <= 0) {
            throw new Error("The tileset image can't create correctly.");
        }

        return tilesets[0];
    }
    
    cropTexture(dx, dy, texture) {
        const crop = new PIXI.Rectangle(dx, dy, this._tileWidth, this._tileHeight);
        const cropTexture = new PIXI.Texture(texture.baseTexture, crop);

        return cropTexture;
    }

    collectAutoTileID(mx, my) {
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

    drawTile(mx, my, tileID) {
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
    drawRect(sx, sy, ex, ey) {

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

    isAutoTile(tileID) {
        return this._autoTileIndexedList.indexOf(tileId) >= 0;
    }

    update(...args) {
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
            i.removeChildren();
        });
    }

    getTileCropTexture(tileID) {
        let texture = PIXI.Texture.from(this._tileset);
        const mapCols = Math.floor(texture.width / this._tileWidth);
        const mapRows = Math.floor((texture.height) / this._tileHeight);
        const dx = (tileID % mapCols) * this._tileWidth;
        const dy = Math.floor(tileID / mapCols) * this._tileHeight;        
        const cropTexture = this.cropTexture(dx, dy, texture);

        return cropTexture;
    }

    toggleLayerVisibility(layerId) {
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
                    container.addChild(sprite);
                }
            }
        }

    }

}

