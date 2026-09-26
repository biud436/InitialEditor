import { EditorSchema } from "./schema/EditorSchema";
// TODO: 데이터를 추가하거나 변경할 수 있도록 해야 합니다.
export const config = {
    SCREEN_WIDTH: 800,
    SCREEN_HEIGHT: 600,
    TILE_WIDTH: 16,
    TILE_HEIGHT: 16,
    MAP_COLS: 32,
    MAP_ROWS: 16,
    LAYERS: 4,
    TRANSPARENT_COLOR_GROUP: ["#007575"],
    TILESET_IMGAGES: [
        "/images/tiles/tileset16-8x13.png",
        "/images/tiles/2k_town05.png",
        "/images/tiles/2k_town05-01.png",
    ],
    Editor: (() => {
        const s = new EditorSchema(this);
        s.initMembers(this);
        return s;
    })(),
    Maps: new EditorSchema(this),
};
//# sourceMappingURL=config.js.map