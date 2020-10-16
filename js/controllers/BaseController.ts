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

    /**
     * 설정 변수에는 CSS 데이터와 부모 컨테이너 정보가 있습니다.
     * 이 값은 JSON으로 되어있습니다.
     */
    protected _config: Config|any;

    protected _isValid: boolean;
    protected _uniqueId: any;
    
    // protected _element: JQuery<HTMLElement>;

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
    
    /**
     * AJAX를 이용하여 새로 고침 없이 창의 실제 데이터(HTML 파일)을 로드합니다.
     */
    load() {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const path = this._config.path;

            // 데이터 파일의 경로를 지정합니다.
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

    /**
     * 비동기적으로 HTML 파일을 시스템으로 불러와 렌더링을 진행하는 메서드입니다.
     * HTML 파일은 뷰(View)에 해당하며 View 데이터는 뷰 모델(View Model)을 통해서만 접근이 가능합니다.
     */
    async render() {
        await this.load().then((result: any) => {
            // 로드가 완료되었을 때 호출되는 콜백 함수입니다.
            // 창의 렌더링을 진행합니다 (다소의 시간 소요)
            this._view.emit("render", result);

        }).catch(err => {
            console.warn(err);
        });
    }

    /**
     * 로드가 완료되면 호출되는 리스너를 지정합니다.
     * 
     * @param elem 
     * @param self 
     */
    onLoad(elem: any, self: any): void {
        this.addEventHandlers(elem, self);
    }    

    addEventHandlers(elem: any, self: any): void  {

    }

}