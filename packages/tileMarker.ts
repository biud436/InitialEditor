import { Service } from "typedi";
import { MarkerRange, TilesetMarker } from "./tilesetMarker";

/**
 * Sets the starting point, it works in the TileMarker.
 * However, it didn't be an instance variable in the TilesetMarker.
 * Basically, because this will be injected from the data store or server or DB in the future.
 */
const POSITION = {
    LEFT_TOP: {
        position: "absolute",
        top: "0",
        left: "0",
        margin: "0",
        padding: "0",
    },
};

const MARKER_BORDER = {
    DOTTED: {
        border: "2px dotted white",
    },
};

const FAKE_STYLED = {
    div: `<div></div>`,
};

@Service()
export default class TileMarker extends TilesetMarker {
    public initWithElement() {
        // In the React library, the class's name may be not match following the name called '.contents',
        // the react will be created a new unique name for the class.
        const parent = $(".contents");
        let child = null;
        if ((child = document.querySelector("#tile-marker"))) {
            parent.get(0)?.removeChild(child);
            return;
        }

        const { _tileWidth: tw, _tileHeight: th } = this;

        // This element will have to be removed it is not fascinating due to using jQuery.
        this._element = $(FAKE_STYLED.div, { id: "tile-marker" }).css({
            "min-width": `${tw}px`,
            "min-height": `${th}px`,
            width: `${tw}px`,
            height: `${th}px`,
            "z-index": "0",
            "box-sizing": "border-box",
            ...MARKER_BORDER.DOTTED,
            ...POSITION.LEFT_TOP,
        });

        this._isReady = true;

        parent.append(this._element);
    }

    public update(...args: any[]) {
        if (!this._isReady) {
            return;
        }

        const target = args[0].target;

        const img = $("#contents__main-canvas")!;
        const mapCols = Math.floor(img.width()! / this._config.TILE_WIDTH);
        const tilesetWidth = img.width()!;
        const tilesetHeight = img.height()!;
        const topY = 0;

        const mouse = args[0];

        const tw = this._tileWidth;
        const th = this._tileHeight;
        let nx = Math.floor(mouse.x / tw) * tw;
        let ny = Math.floor(mouse.y / th) * th;

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

        this._element.css({
            position: "absolute",
            left: nx + "px",
            top: ny - topY + "px",
        });

        return this;
    }
}
