import {
    Component
} from "./component.js";

export default class Tilemap extends Component {

    initMembers() {
        this._tileset = 'images/tiles/tileset16-8x13.png';
        this._tileWidth = 16;
        this._tileHeight = 16;
        this._mapCols = 8;
        this._mapRows = 8;
        this._tileId = 45;
        this._mouseX = 0;
        this._mouseY = 0;

        this._mapWidth = Math.round(800 / this._tileWidth);
        this._mapHeight = Math.round(600 / this._tileHeight);
        this._layerCount = 4;

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
            width: 800,
            height: 600,
            backgroundColor: 0x000000,
            resolution: window.devicePixelRatio || 1,
            view: document.querySelector("#main-canvas")
        });
        this._container = new PIXI.Container();
        this._container.interactive = true;
        this._container.on("mousemove", this.onMouseMove.bind(this));
        this.app.stage.addChild(this._container);        
        // this.draw();
    }

    get app() {
        return this._app;
    }

    onMouseMove(ev) {
        this._mouseX = ev.data.global.x;
        this._mouseY = ev.data.global.y;

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
        const mapWidth = Math.round(800 / this._tileWidth);
        const mapHeight = Math.round(600 / this._tileHeight);
        sprite.x = Math.floor(mx / this._tileWidth) * this._tileWidth;
        sprite.y = Math.floor(my / this._tileHeight) * this._tileHeight;

        

        this._container.addChild(sprite);
    }

    update(...args) {
        this.drawTile(this._mouseX, this._mouseY, this._tileId);
    }

    draw() {        
        this._container.removeChildren();

        const mapWidth = Math.round(800 / this._tileWidth);
        const mapHeight = Math.round(600 / this._tileHeight);

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