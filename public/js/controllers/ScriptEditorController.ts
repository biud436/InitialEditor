import { EventEmitter } from "../EventEmitter";
import BaseController from "./BaseController";

interface ScriptItem {
    name: string;
    langType: string;
}

interface ScriptEditorConfig {
    items: ScriptItem[];
}

export default class ScriptEditorController extends BaseController {

    public listeners: EventEmitter;
    private _isReady: boolean;
    

    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config: any) {
        super( config );
        this.create();
    }

    initMembers(config: any) {
        super.initMembers(config);
        
        this.listeners = new EventEmitter();
        this._isReady = false;
    }

    /**
     * Added react.js
     */
    create() {

        // 동적 컨테이너 생성
        const domContainer = document.createElement('div');

        domContainer
            .classList
            .add("script-editor-container");

        const windowContainer = document.querySelector(".windows-container");
        
        windowContainer.appendChild(domContainer);

        const urls = [
            "https://unpkg.com/react@17/umd/react.production.min.js",
            "https://unpkg.com/react-dom@17/umd/react-dom.production.min.js"
        ];

        // 대기 횟수 계산 함수 생성
        const pendingFunc = (i=0) => () => i++;
        const pendingCount = pendingFunc();

        this.listeners.on("ready", this.onReactLoad.bind(this));
        
        urls.forEach(src => {
            const script = document.createElement("script");
            script.crossOrigin = 'anonymous';
            script.src = src;
            script.onload = () => {
                const isMaxCount = pendingCount() >= urls.length - 1;
                if( isMaxCount ) {
                    this._isReady = true;

                    // 스크립트 로드 완료 이벤트 호출
                    this.listeners.emit("ready");
                }
            };

            document.body.appendChild(script);
        });
    }

    onReactLoad() {
        alert("React.js 스크립트 동적 바인드가 완료되었습니다.");
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

    /**
     * Open the script eidtor window by using ajax.
     */
    open() {
        const method = "/script/open";

        this.openWindow(method).then(result => {
            const data : ScriptEditorConfig = JSON.parse(result);
        }).catch(err => {
            console.log(err);
        }) 
    }

    openWindow(url: string) : Promise<string> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

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

}