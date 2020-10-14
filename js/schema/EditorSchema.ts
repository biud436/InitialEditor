import { Schema } from "./Schema";

class EditorSchema extends Schema {
    ProjectPath: string;
    TileWidth: number;
    TileHeight: number;
    CurrentLayer: number;
    StartMapId: number;
    CurrentMapId: number;
    LayerCount: number;

    initMembers(config: any) {
        this.ProjectPath = "E:\\VS2015\\Projects\\Initial2D";
        this.TileWidth = 16;
        this.TileHeight = 16;
        this.CurrentLayer = 1;
        this.StartMapId = 1;
        this.CurrentMapId = 1;
        this.LayerCount = 4;
    }
}

export {EditorSchema};