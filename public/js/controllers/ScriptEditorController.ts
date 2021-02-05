import BaseController from "./BaseController";

interface ScriptItem {
    name: string;
    langType: string;
}

interface ScriptEditorConfig {
    items: ScriptItem[];
}

export default class ScriptEditorController extends BaseController {
    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config: any) {
        super( config );
    }

    /**
     * Open the script eidtor window by using ajax.
     */
    open() {
        const method = "/openScriptEditor";

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