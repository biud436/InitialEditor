export default class Model {
    _data: {
        width: string;
        height: string;
        parentId: string;
        id: string;
        zIndex: string;
        path: string;
    };
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
    getData(): {
        width: string;
        height: string;
        parentId: string;
        id: string;
        zIndex: string;
        path: string;
    };
    get data(): {
        width: string;
        height: string;
        parentId: string;
        id: string;
        zIndex: string;
        path: string;
    };
}
