export namespace config {
    const SCREEN_WIDTH: number;
    const SCREEN_HEIGHT: number;
    const TILE_WIDTH: number;
    const TILE_HEIGHT: number;
    const MAP_COLS: number;
    const MAP_ROWS: number;
    const LAYERS: number;
    const TRANSPARENT_COLOR_GROUP: string[];
    const TILESET_IMGAGES: string[];
    const Editor: EditorSchema;
    const Maps: EditorSchema;
}
import { EditorSchema } from "./schema/EditorSchema";
