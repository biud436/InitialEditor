import { Schema } from "./Schema";
declare enum Theme {
    DARK = 0,
    LIGHT = 1
}
declare class EditorSchema extends Schema {
    ProjectPath: string;
    TileWidth: number;
    TileHeight: number;
    CurrentLayer: number;
    StartMapId: number;
    CurrentMapId: number;
    LayerCount: number;
    Theme: Theme;
    initMembers(config: any): void;
}
export { EditorSchema };
