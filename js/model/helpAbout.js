export default class HelpAbount {
    
    constructor() {
        this._data = this.getData();
    }

    getData() {
        return {
            width: "100%",
            height: "100%",
            parentId: ".flex-container",
            id: "helpAbout",
            zIndex: "10",
            path: "view/windows/helpWindow.html",
        }; 
    }

    get data() {
        return this._data;
    }
} 