import { Schema } from "./Schema";

enum Theme {
    DARK = 0,
    LIGHT = 1,
}

class EditorSchema extends Schema {
    ProjectPath: string;
    TileWidth: number;
    TileHeight: number;
    CurrentLayer: number;
    StartMapId: number;
    CurrentMapId: number;
    LayerCount: number;
    Theme: Theme;

    initMembers(config: any) {
        this.ProjectPath = "";
        this.TileWidth = 16;
        this.TileHeight = 16;
        this.CurrentLayer = 1;
        this.StartMapId = 1;
        this.CurrentMapId = 1;
        this.LayerCount = 4;
        this.Theme = Theme.DARK;

        if (config) {
            Object.assign(this, config);
        }
    }
}

export { EditorSchema };
