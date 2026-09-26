var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TilesetMarker_1;
import { Component } from "./component";
import { Service } from "typedi";
import InitialDOM from "./utils/InitialDOM";
import App from "./app";
/**
 * @class TilesetMarker
 * @description
 * This class allows you to select a range of tiles or select a single tile.
 */
let TilesetMarker = TilesetMarker_1 = class TilesetMarker extends Component {
    initMembers(...args) {
        this._config = args[0];
        this._tileWidth = this._config.TILE_WIDTH;
        this._tileHeight = this._config.TILE_HEIGHT;
        this._isReady = false;
        this._isDragging = false;
        this._lastTileId = 0;
        this._tiles = [];
        this.initWithElement();
        this.active();
        console.log("TilesetMarker.initMembers()");
    }
    initWithElement() {
        const parent = InitialDOM.query("#view");
        let child = null;
        if ((child = InitialDOM.query("#tileset-marker"))) {
            parent?.removeChild(child);
            return;
        }
        this._element = InitialDOM.fetch("div");
        this._element.id = "tileset-marker";
        // prettier-ignore
        // vscode-styled-components가 이를 인식하여 문제를 일으키기 때문에 Enter를 눌러 줄을 바꿔줘야 합니다.
        this._element.className = InitialDOM.css `
            min-width: ${this._tileWidth}px;
            min-height: ${this._tileHeight}px;
            width: ${this._tileWidth}px;
            height: ${this._tileHeight}px;
            position: absolute;
            top: 0;
            left: 0;
            margin: 0;
            padding: 0;
            border: 2px dotted yellow;
            z-index: 50;
            box-sizing: border-box
        `;
        this._isReady = true;
        parent?.appendChild(this._element);
        this._isDraw = false;
        this._isClicked = false;
        this._blockSize = new BlockSize(0, 0, this._tileWidth, this._tileHeight);
        this._blockSize.setParent(this._element);
        this.on("changeTile", (range) => this.onChangeTileID(range));
        this.touches = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ];
    }
    start(...args) {
        return this;
    }
    update(...args) {
        if (!this._isReady) {
            console.log("TilesetMarker is not ready");
            return;
        }
        const img = InitialDOM.query("#view canvas");
        console.log(img);
        if (!img) {
            console.log("TilesetMarker img is not ready");
            return;
        }
        const imageWidth = img.width;
        const imageHeight = img.height;
        const mapCols = Math.floor(imageWidth / this._config.TILE_WIDTH);
        const tilesetWidth = imageWidth;
        const tilesetHeight = imageHeight;
        const topY = 0;
        const mouse = args[0];
        const tw = this._tileWidth;
        const th = this._tileHeight;
        const scrollTop = InitialDOM.query("#view")?.scrollTop || 0;
        const scrollLeft = InitialDOM.query("#view")?.scrollLeft || 0;
        const mouseX = mouse.x + scrollLeft;
        const mouseY = mouse.y + scrollTop;
        let nx = Math.floor(mouseX / tw) * tw;
        let ny = Math.floor(mouseY / th) * th;
        const targetX = nx / tw;
        const targetY = (ny - topY) / th;
        if (nx < 0) {
            nx = 0;
        }
        if (nx > tilesetWidth - tw) {
            nx = tilesetWidth - tw;
        }
        if (ny < 0) {
            ny = 0;
        }
        if (ny > tilesetHeight) {
            ny = tilesetHeight - th + topY;
        }
        if (!this._isDragging) {
            this._element.style.position = "absolute";
            this._element.style.left = nx + "px";
            this._element.style.top = ny - topY + "px";
            this._element.style.width = tw + "px";
            this._element.style.height = th + "px";
        }
        console.log("타일 ID : " + (targetY * mapCols + targetX));
        const lastTileID = targetY * mapCols + targetX;
        App.GetInstance().setTileId(lastTileID);
        if (this._lastTileId !== lastTileID) {
            this.emit("changeTile", {
                lastTileID,
                targetX,
                targetY,
            });
        }
        this._lastTileId = lastTileID;
    }
    onChangeTileID(range) {
        console.log("마지막 타일 ID : " + range.lastTileID);
        if (this._isDragging) {
            this._tiles.push(range.lastTileID);
            const c = this._lastTileId - range.lastTileID;
            if (c >= 1) {
                this._blockSize.width = this._tileWidth * c;
            }
        }
    }
    /**
     * 드래그가 시작될 떄 호출됩니다.
     * @param args
     */
    onDragEnter(...args) {
        // 마우스 객체를 획득합니다.
        const mouse = args[0];
        const sx = mouse.startX;
        const sy = mouse.startY;
        // 드래그 중이라면 타일셋 마커의 크기를 늘립니다.
        if (mouse.dragTime && mouse.dragTime > TilesetMarker_1.DRAGGING_DELAY) {
            this._isDragging = true;
            this.update(mouse);
            // TilesetMarker.DRAGGING_DELAY 만큼 딜레이가 생기게 되므로, 가속도를 보정해야 합니다.
            // 대각선 방향일 때에는 가속도가 1.4배로 늘어나기 때문에, 가속도를 보정해야 합니다.
            // sx 및 sy 좌표 보정 필요.
            const lineWidth = Math.abs(mouse.x - mouse.startX);
            const lineHeight = Math.abs(mouse.y - mouse.startY);
            this.updateBlockSize(sx, sy, lineWidth, lineHeight);
        }
    }
    updateBlockSize(x, y, width, height) {
        this._blockSize.x = Math.floor(x / this._tileWidth) * this._tileWidth;
        this._blockSize.y = Math.floor(y / this._tileHeight) * this._tileHeight;
        this._blockSize.width =
            Math.floor(width / this._tileWidth) * this._tileWidth;
        this._blockSize.height =
            Math.floor(height / this._tileHeight) * this._tileHeight;
        this._blockSize.refresh();
    }
    /**
     * 드래그가 종료될 때 호출됩니다.
     * @param args
     */
    onDragLeave(...args) {
        const mouse = args[0];
        if (this._isDragging) {
            console.log("드래그가 끝났습니다");
            this._isDragging = false;
            this._tiles = [];
            this._blockSize.x = mouse.startX;
            this._blockSize.y = mouse.startY;
        }
    }
};
TilesetMarker.DRAGGING_DELAY = 33;
TilesetMarker = TilesetMarker_1 = __decorate([
    Service()
], TilesetMarker);
class BlockSize {
    constructor(x, y, width, height) {
        this._x = 0;
        this._y = 0;
        this._width = 0;
        this._height = 0;
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
        this._parent = null;
    }
    set width(value) {
        this._width = value;
    }
    set height(value) {
        this._height = value;
    }
    get width() {
        return this._width;
    }
    get height() {
        return this._height;
    }
    set x(value) {
        this._x = value;
    }
    set y(value) {
        this._y = value;
    }
    get x() {
        return this._x;
    }
    get y() {
        return this._y;
    }
    setParent(parent) {
        this._parent = parent;
    }
    refresh() {
        const elem = this._parent;
        if (elem) {
            elem.style.width = this.width + "px";
            elem.style.height = this.height + "px";
            elem.style.left = this.x + "px";
            elem.style.top = this.y + "px";
            elem.style.position = "absolute";
        }
    }
}
export { TilesetMarker };
//# sourceMappingURL=tilesetMarker.js.map