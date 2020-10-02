import Model from "./Model.js";

export default class GamePropertiesWindowModel extends Model {

    getData() {
        return {
            width: "240px",
            height: "100%",
            parentId: ".darken",
            id: "newContainer",
            zIndex: "10",
            path: "view/windows/context.html",
            position: "absolute",
        }; 
    }

}