import BaseController from "./BaseController";

interface ScriptItem {
    name: string;
    langType: string;
}

interface ScriptEditorConfig {
    items: ScriptItem[];
}

export default class ScriptEditorController extends BaseController {

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
        
        this._isReady = false;
    }

    /**
     * Added react.js
     */
    create() {

        const urls = [
            "https://unpkg.com/react@17/umd/react.production.min.js",
            "https://unpkg.com/react-dom@17/umd/react-dom.production.min.js"
        ];

        // 대기 횟수 계산 함수 생성
        const pendingFunc = (i=0) => () => i++;
        const pendingCount = pendingFunc();
        
        urls.forEach(src => {
            const script = document.createElement("script");
            script.crossOrigin = 'anonymous';
            script.src = src;
            script.onload = () => {
                const isMaxCount = pendingCount() >= urls.length - 1;
                if( isMaxCount ) {
                    alert("React.js 스크립트 동적 바인드가 완료되었습니다.");
                    this._isReady = true;
                }
            };

            document.body.appendChild(script);
        });
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