import Model from "./Model.js";

export default class HelpAboutWindowModel extends Model {
    
    constructor() {
        this._data = this.getData();
    }

    getData() {
        return {
            width: "100%",
            height: "100%",
            parentId: ".darken",
            id: "helpAbout",
            zIndex: "11",
            path: "view/windows/helpWindow.html",
        }; 
    }

    get data() {
        return this._data;
    }
} 