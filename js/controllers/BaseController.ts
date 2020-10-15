import App from "../App";

import {ViewModel} from "../viewmodels/ViewModel";

interface Config {
    widht: string;
    height: string;
    parentId: string;
    id: string;
    zIndex: string;
    path: string;
    position: string;
    display: string;
}

interface ViewModelImpl {
    createViewModel(): void;
}

/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class BaseController implements ViewModelImpl {
    
    protected _view: ViewModel;

    protected _config: Config|any;
    protected _isValid: boolean;
    protected _uniqueId: any;
    protected _element: JQuery<HTMLElement>;

    get config() {
        return this._config;
    }

    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config: any) {
        this.createViewModel();
        this.initMembers(config.data);
        this.initWithCanvas();
    }

    createViewModel() {
        this._view = new ViewModel(this);
    }

    initMembers(config: any): void {

        /**
         * 실제 HTML 파일이 있는 위치
         */
        this._config = config;
        this._isValid = false;
        this._uniqueId = null;
    }    

    setUniqueId(id: any): void {
        this._uniqueId = id;
    }

    initWithCanvas() {
        const config = this._config;
        this._view.emit("create", config);
    }

    hide() {
        this._view.onHide();      
    }

    invalid() {
        this._isValid = false;
    }

    valid() {
        this._isValid = true;
    }

    show() {
        this._view.emit("show");
    }

    remove() {
        this._view.emit("dispose");
    }

    isMobile() {
        const r = /Android|webOS|iPhone|iPad|iPod|BlackBerry|Opera Mini/i;
        return !!navigator.userAgent.match(r);
    }     
    
    load() {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const path = this._config.path;
            const url = `${location.href.slice(0,location.href.lastIndexOf("/"))}/${path}`;
            xhr.open("GET", url);
            xhr.onload = function() {
                if(xhr.status === 200) {
                    resolve(xhr.responseText);
                }
            }
            xhr.onerror = reject;
            xhr.send();
        });
    }

    async render() {
        await this.load().then((result: any) => {
            this._view.emit("render", result);
        }).catch(err => {
            console.warn(err);
        });
    }

    onLoad(elem: any, self: any): void {
        this.addEventHandlers(elem, self);
    }    

    addEventHandlers(elem: any, self: any): void  {

    }

}