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
        this._tileset = 'images/tiles/tileset16-8x13.png';
        this._tileWidth = window.config.TILE_WIDTH;
        this._tileHeight = window.config.TILE_HEIGHT;
        this._mapCols = window.config.MAP_COLS;
        this._mapRows =window.config.MAP_ROWS;
        this._tileId = 0;
        this._mouseX = 0;
        this._mouseY = 0;

        this._mapWidth = Math.round(window.config.SCREEN_WIDTH / this._tileWidth);
        this._mapHeight = Math.round(window.config.SCREEN_HEIGHT / this._tileHeight);
        this._layerCount = window.config.LAYERS;

        if(!(this._data = localStorage.getItem("tileMapData"))) {
            this._data = new Array(this._mapWidth * this._mapHeight * 4);
        }
        
        const tilesetImg = document.querySelector("#view img");
        if(!tilesetImg) {
            throw new Error("Cant't find tileset");
        }
        
        this._mapCols = Math.floor(tilesetImg.width / this._tileWidth);
        this._mapRows = Math.floor(tilesetImg.width / this._tileWidth);    
        
        this.active();
    }

    initWithDrawingType() {
        this._penType = 0;
        document.querySelector("#pen-tool").onclick = (ev) => {
            this._penType = 0;
            console.log("펜");
        };
        document.querySelector("#square-tool").onclick = (ev) => {
            this._penType = 1;
            console.log("사각형");
        };
    }

    setData(x, y, z, tileId) {
        this._data[(this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x] = tileId;
    }

    getData(x, y, z) {
        return this._data[(this._mapWidth * this._mapHeight * z) + (this._mapWidth * y) + x];
    }

    setTileId(tileId) {
        this._tileId = tileId;
    }

    getTileId() {
        return this._tileId;
    } 

    start() {
        this._app = new PIXI.Application({
            width: window.config.SCREEN_WIDTH,
            height: window.config.SCREEN_HEIGHT,
            backgroundColor: 0x000000,
            resolution: window.devicePixelRatio || 1,
            view: document.querySelector("#main-canvas")
        });
        
        this._container = new PIXI.Container();
        this._container.interactive = true;
        this._container.on("mousemove", this.onMouseMove.bind(this));

        this.app.stage.addChild(this._container);    
        
        this._tilesets = [];
        this._tilesets.push(PIXI.Texture.from(this._tileset));  
        
        this.initWithDrawingType();

        document.querySelector("#take-screenshot").addEventListener("click", this.takeScreenshot.bind(this), false);
        
        // this.draw();
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

    drawTile(mx, my, tileID) {
        let texture = PIXI.Texture.from(this._tileset);
        const dx = Math.floor(tileID % this._mapCols) * this._tileWidth;
        const dy = Math.floor(tileID / this._mapRows) * this._tileHeight;        
        texture = this.cropTexture(dx, dy, texture);

        const sprite = new PIXI.Sprite(texture);
        const mapWidth = Math.round(window.config.SCREEN_WIDTH / this._tileWidth);
        const mapHeight = Math.round(window.config.SCREEN_HEIGHT / this._tileHeight);
        sprite.x = Math.floor(mx / this._tileWidth) * this._tileWidth;
        sprite.y = Math.floor(my / this._tileHeight) * this._tileHeight;

        this._container.addChild(sprite);
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

        const mapWidth = Math.round(window.config.SCREEN_WIDTH / this._tileWidth);
        const mapHeight = Math.round(window.config.SCREEN_HEIGHT / this._tileHeight);

        const mx = Math.floor(sx / this._tileWidth);
        const my = Math.floor(sy / this._tileHeight);   

        let texture = PIXI.Texture.from(this._tileset);
        const tileID = this._tileId;
        const dx = (tileID % this._mapCols) * this._tileWidth;
        const dy = (tileID / this._mapRows) * this._tileHeight;        
        const cropTexture = this.cropTexture(dx, dy, texture);  
        
        const width = mx + ex;
        const height = my + ey;

        for(let y = my; y < height; y++) {
            for(let x = mx; x < width; x++) {
                const sprite = new PIXI.Sprite(cropTexture);
                sprite.x = x * this._tileWidth;
                sprite.y = y * this._tileHeight;
                this._container.addChild(sprite);
            }
        }        
    }

    update(...args) {
        const penType = this._penType;

        switch(penType) {
            case 0: 
                this.drawTile(this._mouseX, this._mouseY, this._tileId);
                break;
            case 1:
                this.drawRect(this._mouseX, this._mouseY, 20, 5);
                break;
        }
    }

    draw() {        
        this._container.removeChildren();

        const mapWidth = Math.round(window.config.SCREEN_WIDTH / this._tileWidth);
        const mapHeight = Math.round(window.config.SCREEN_HEIGHT / this._tileHeight);

        let texture = PIXI.Texture.from(this._tileset);
        const tileID = this._tileId;
        const dx = (tileID % this._mapCols) * this._tileWidth;
        const dy = (tileID / this._mapRows) * this._tileHeight;        
        const cropTexture = this.cropTexture(dx, dy, texture);

        for(let y = 0; y < mapHeight; y++) {
            for(let x = 0; x < mapWidth; x++) {
                const sprite = new PIXI.Sprite(cropTexture);
                sprite.x = x * this._tileWidth;
                sprite.y = y * this._tileHeight;
                this._container.addChild(sprite);
            }
        }
    }

}

