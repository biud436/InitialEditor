import { Schema } from "./Schema.js";

class EditorSchema extends Schema {
    initMembers(config) {
        this.ProjectPath = "E:\\VS2015\\Projects\\Initial2D";
        this.TileWidth = 16;
        this.TileHeight = 16;
        this.CurrentLayer = 1;
        this.StartMapId = 1;
        this.CurrentMapId = 1;
    }
}

export {EditorSchema};