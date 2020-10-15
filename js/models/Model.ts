import {EventEmitter} from "../EventEmitter";

export default class Model extends EventEmitter {

    protected _data: any;
    public VIEW: JQuery<HTMLElement>;
    
    constructor() {
        super();

        // 데이터를 가져옵니다.
        this._data = this.getData();

        // 뷰를 가져옵니다.
        this.VIEW = $(`#${this._data.id}`);

        this.emit("create", this._data);
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

    set data(value) {
        this._data = value;
        this.emit("change", this._data);
    }
}