import Model from "./Model.js";

export class TilesetWindowModel extends Model {
    getData() {
        return {
            width: "240px",
            height: "100%",
            parentId: ".windows-container",
            id: "tileset-container", /** ID에 "Window"가 들어가면 안됩니다 */
            zIndex: "10",
            path: "view/windows/tilesetWindow.html",
        }
    }
}