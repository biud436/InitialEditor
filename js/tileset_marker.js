import {Component} from "./component.js";

/**
 * @class TilesetMarker
 */
class TilesetMarker extends Component {
    initMembers() {
        this._tileWidth = 16;
        this._tileHeight = 16;
        this._isReady = false;
        
        this.initWithElement();
        this.active();
    }

    initWithElement() {
        const parent = document.querySelector("#view");
        let child = null;
        if((child = document.querySelector("#tileset-marker"))) {
            parent.removeChild(child);
            return;
        }

        this._element = document.createElement("div");
        this._element.id = "tileset-marker";
        this._element.style.minWidth = "16px";
        this._element.style.minHeight = "16px";
        this._element.style.width = "16px";
        this._element.style.height = "16px";
        this._element.style.position = "absolute";
        this._element.style.top = "0";
        this._element.style.left = "0";
        this._element.style.margin = "0";
        this._element.style.padding = "0";
        this._element.style.border = "2px dotted white";
        this._element.style.zIndex = "50";
        this._element.style.boxSizing = "border-box";

        this._isReady = true;
        
        parent.appendChild(this._element);
    }

    start() {
        
    }

    update(...args) {
        if(!this._isReady) {
            return;
        }

        const target = args[0].target;
        
        const parent = document.querySelector("#view");
        const img = $("#view canvas");
        // const tileset = getComputedStyle(img);
        const tilesetWidth = img.width();
        const tilesetHeight = img.height();
        console.log(tilesetWidth, tilesetHeight);
        const topY = 0;

        const mouse = args[0];

        const tw = 16;
        const th = 16;
        let nx = Math.floor(mouse.x / tw) * tw;
        let ny = Math.floor(mouse.y / th) * th;

        const mapCols = tilesetWidth / tw;
        const mapRows = tilesetHeight / th;    
        const cursorCols = parseInt(this._element.style.left) / tw;
        const cursorRows = parseInt(this._element.style.top) / th;
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

        this._element.style.position = "absolute";
        this._element.style.left = nx + "px";
        this._element.style.top = ny - topY + "px";

        window.app.setTileId(targetY * 8 + targetX);
    }

}


export {TilesetMarker};