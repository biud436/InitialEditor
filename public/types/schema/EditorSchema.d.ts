export class EditorSchema extends Schema {
    constructor(config: any);
    ProjectPath: string;
    TileWidth: number;
    TileHeight: number;
    CurrentLayer: number;
    StartMapId: number;
    CurrentMapId: number;
}
import { Schema } from "./Schema.js";
