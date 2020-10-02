export default class Model {
    
    constructor() {
        this._data = this.getData();
    }

    /**
     * @return {{
     *  width: String,
     *  height: String,
     *  parentId: String,
     *  id: String,
     *  zIndex: String,
     *  path: String,
     * }}
     */
    getData() {
        return {
        }; 
    }

    get data() {
        return this._data;
    }
}