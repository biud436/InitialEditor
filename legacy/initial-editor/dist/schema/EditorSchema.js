import { Schema } from "./Schema";
var Theme;
(function (Theme) {
    Theme[Theme["DARK"] = 0] = "DARK";
    Theme[Theme["LIGHT"] = 1] = "LIGHT";
})(Theme || (Theme = {}));
class EditorSchema extends Schema {
    initMembers(config) {
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
//# sourceMappingURL=EditorSchema.js.map