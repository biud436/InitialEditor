import {EditorSchema} from "./schema/EditorSchema";
import {MapSchema} from "./schema/MapSchema";

const config = {
    SCREEN_WIDTH: 800,
    SCREEN_HEIGHT: 600,
    TILE_WIDTH: 16,
    TILE_HEIGHT: 16,
    MAP_COLS: 32,
    MAP_ROWS: 8,
    LAYERS: 4,
    TRANSPARENT_COLOR_GROUP: ["#007575"],
    TILESET_IMGAGES: [
        "./images/tiles/tileset16-8x13.png",
        "./images/tiles/2k_town05.png",
        "./images/tiles/2k_town05-01.png",
    ],
    Editor: new EditorSchema(this),
    Maps: new EditorSchema(this),
};

export {config};