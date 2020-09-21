import {TilesetMarker} from "./tilesetMarker.js";

export default class TileMarker extends TilesetMarker {

    initWithElement() {
        const parent = $(".contents");
        let child = null;
        if((child = document.querySelector("#tile-marker"))) {
            parent.get(0).removeChild(child);
            return;
        }

        this._element = $("<div></div>", {"id" : "tile-marker"})
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
                "z-index": "0",
                "box-sizing": "border-box",
            });

        this._isReady = true;
        
        parent.append(this._element);
    }

    update(...args) {
        if(!this._isReady) {
            return;
        }

        const target = args[0].target;

        const img = $("#contents__main-canvas");
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
    }    
}