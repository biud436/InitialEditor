import { EditorSchema } from "./schema/EditorSchema";
/**
 * @interface MyEditorConfig
 * @description
 * This interface allows user to set the configuration for the editor.
 * @author Jinseok Eo
 */
export declare type MyEditorConfig = {
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
export declare const config: MyEditorConfig;
