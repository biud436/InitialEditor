export default class GamePropertiesWindow {
    
    constructor() {
        this._data = this.getData();
    }

    getData() {
        return {
            width: "100%",
            height: "100%",
            parentId: ".flex-container",
            id: "newContainer",
            zIndex: "10",
            path: "view/windows/context.html",
        }; 
    }

    get data() {
        return this._data;
    }
}