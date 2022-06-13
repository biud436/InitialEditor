import { EditorSchema } from "./schema/EditorSchema";

/**
 * @interface MyEditorConfig
 * @description
 * This interface allows user to set the configuration for the editor.
 * @author Jinseok Eo
 */
export type MyEditorConfig = {
    /**
     * 화면 가로 크기
     */
    SCREEN_WIDTH: number;
    /**
     * 화면 세로 크기
     */
    SCREEN_HEIGHT: number;
    TILE_WIDTH: number;
    TILE_HEIGHT: number;
    MAP_COLS: number;
    MAP_ROWS: number;
    LAYERS: number;
    TRANSPARENT_COLOR_GROUP: string[];
    TILESET_IMGAGES: string[];
    Editor: EditorSchema;
    Maps: EditorSchema;
};

export const config = <MyEditorConfig>{
    SCREEN_WIDTH: 800,
    SCREEN_HEIGHT: 600,
    TILE_WIDTH: 16,
    TILE_HEIGHT: 16,
    MAP_COLS: 32,
    MAP_ROWS: 8,
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
