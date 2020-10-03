import Model from "./Model.js";

export class TilesetWindowModel extends Model {
    getData() {
        return {
            width: "100%",
            height: "100%",
            parentId: ".windows-container",
            id: "tileset-window-container",
            zIndex: "10",
            path: "view/windows/tilesetWindow.html",
        }
    }
}