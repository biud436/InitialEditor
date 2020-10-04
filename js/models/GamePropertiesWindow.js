import Model from "./Model.js";

export default class GamePropertiesWindowModel extends Model {

    getData() {
        return {
            width: "240px",
            height: "100%",
            parentId: ".windows-container",
            id: "newContainer", /** ID에 "Window"가 들어가면 안됩니다 */
            zIndex: "10",
            path: "view/windows/newWindow.html",
            position: "absolute",
            display: "flex",
        }; 
    }

}