// //@ts-check
import {
    Component
} from "./component.js";

// @ts-ignore
window.config = {
    SCREEN_WIDTH: 800,
    SCREEN_HEIGHT: 600,
    TILE_WIDTH: 16,
    TILE_HEIGHT: 16,
    MAP_COLS: 8,
    MAP_ROWS: 8,
    LAYERS: 4
};

export default class Tilemap extends Component {

    initMembers() {
        this._tileset = $("#view canvas").get(0);
        this._tileWidth = window.config.TILE_WIDTH;
        this._tileHeight = window.config.TILE_HEIGHT;
        this._mapCols = window.config.MAP_COLS;
        this._mapRows =window.config.MAP_ROWS;
        this._tileId = 0;
        this._mouseX = 0;
        this._mouseY = 0;
        this._currentLayer = 0;
        this._autoTileIndexedList = [];
        this._autoTileTextureList = {};
        
        // 1이면 오토타일, 0이면 일반 타일
        this._tileType = 0;

        this._mapWidth = Math.round(window.config.SCREEN_WIDTH / this._tileWidth);
        this._mapHeight = Math.round(window.config.SCREEN_HEIGHT / this._tileHeight);
        this._layerCount = window.config.LAYERS;

        if(!(this._data = localStorage.getItem("tileMapData"))) {
            this._data = new Array(this._mapWidth * this._mapHeight * 4);
        }
        
        const tilesetImg = $("#view canvas").get(0);
        if(!tilesetImg) {
            throw new Error("Cant't find tileset");
        }
        
        this._mapCols = Math.floor(tilesetImg.width / this._tileWidth);
        this._mapRows = Math.floor(tilesetImg.width / this._tileWidth);    
        
        this.active();
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
        this._data[(this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x] = tileId;
    }

    getData(x, y, z) {
        return this._data[(this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x] || 0;
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
        this._app = new PIXI.Application({
            width: window.config.SCREEN_WIDTH,
            height: window.config.SCREEN_HEIGHT,
            backgroundColor: 0x000000,
            resolution: window.devicePixelRatio || 1,
            view: $("#main-canvas").get(0)
        });

        this._layerContainer = new PIXI.Container();
        this._layerContainer.interactive = true;
        this._layerContainer.on("mousemove", this.onMouseMove.bind(this));
        this.app.stage.addChild(this._layerContainer);   

        for(let i = 0; i < window.config.LAYERS; i++) {
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
        const mapX = Math.floor(mx / this._tileWidth);
        const mapY = Math.floor(my / this._tileHeight);

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

        const mx = Math.floor(sx / this._tileWidth);
        const my = Math.floor(sy / this._tileHeight);   

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
                this.drawTile(this._mouseX, this._mouseY, this._tileId);
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
        const dx = (tileID % this._mapCols) * this._tileWidth;
        const dy = Math.floor(tileID / this._mapRows) * this._tileHeight;        
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

        const mapWidth = Math.round(window.config.SCREEN_WIDTH / this._tileWidth);
        const mapHeight = Math.round(window.config.SCREEN_HEIGHT / this._tileHeight);

        for(let z = 0; z < window.config.LAYERS; z++) {
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

