import Model from "./Model";

class TilesetWindowModel extends Model {
    getData() {
        return {
            width: "540px",
            height: "100%",
            parentId: ".windows-container",
            id: "tileset-container", /** ID에 "Window"가 들어가면 안됩니다 */
            zIndex: "10",
            path: "view/windows/tilesetWindow.html",
            opacity: "1.0",
        }
    }
}

export {TilesetWindowModel};