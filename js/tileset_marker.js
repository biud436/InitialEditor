import {Component} from "./component.js";

/**
 * @class TilesetMarker
 */
class TilesetMarker extends Component {
    initMembers(...args) {
        this._config = args[0];
        this._tileWidth = this._config.TILE_WIDTH;
        this._tileHeight = this._config.TILE_HEIGHT;
        this._isReady = false;
        
        this.initWithElement();
        this.active();
    }

    initWithElement() {
        const parent = $("#view");
        let child = null;
        if((child = document.querySelector("#tileset-marker"))) {
            parent.get(0).removeChild(child);
            return;
        }

        this._element = $("<div></div>", {"id" : "tileset-marker"})
            .css({
                "min-width": `${this._tileWidth}px`,
                "min-height": `${this._tileHeight}px`,
                "width": `${this._tileWidth}px`,
                "height": `${this._tileHeight}px`,
                "position": "absolute",
                "top": "0",
                "left": "0",
                "margin": "0",
                "padding": "0",
                "border": "2px dotted white",
                "z-index": "50",
                "box-sizing": "border-box",
            });

        this._isReady = true;
        
        parent.append(this._element);
    }

    start() {
        
    }

    update(...args) {
        if(!this._isReady) {
            return;
        }

        const target = args[0].target;

        const img = $("#view canvas");
        const mapCols = Math.floor(img.width() / this._config.TILE_WIDTH);
        const tilesetWidth = img.width();
        const tilesetHeight = img.height();
        const topY = 0;

        const mouse = args[0];

        const tw = this._tileWidth;
        const th = this._tileHeight;
        let nx = Math.floor(mouse.x / tw) * tw;
        let ny = Math.floor(mouse.y / th) * th;

        const targetX = nx / tw;
        const targetY = (ny - topY) / th;

        if(nx < 0) {
            nx = 0;
        }
        if(nx > tilesetWidth - tw) {
            nx = tilesetWidth - tw;
        }
        if(ny < 0) {
            ny = 0;
        }
        if(ny > tilesetHeight) {
            ny = tilesetHeight - th + topY;
        }

        this._element.css({
            position : "absolute",
            left : nx + "px",
            top : ny - topY + "px",
        });

        console.log("타일 ID : " + targetY * mapCols + targetX);

        window.app.setTileId(targetY * mapCols + targetX);
    }

}


export {TilesetMarker};