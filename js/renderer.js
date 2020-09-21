import GamePropertiesWindow from "./model/gamePropertiesWindow.js";

/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class GamePropertiesWindowController {

    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config) {
        this.initMembers(config.data);
        this.initWithCanvas();
    }

    initMembers(config) {

        /**
         * 실제 HTML 파일이 있는 위치
         */
        this._config = config;
        this._isValid = false;
    }

    initWithCanvas() {
        const config = this._config;

        if(!config.parentId || !config.id) {
            throw new Error("The parent element is not exist!");
        }

        this._element = document.createElement("div");
        if(config.position) this._element.style.position = config.position || "fixed";  
        if(config.x) this._element.style.marginLeft = config.x;
        if(config.y) this._element.style.marginTop = config.y;        
        this._element.style.width = config.width || "50%";
        this._element.style.height = config.height || "50%";
        this._element.style.zIndex = config.zIndex || 1000;
        this._element.id = config.id;

        this.hide();

        $(this._element).draggable({ snap: ".contents" });
        $("#newContainer").resizable({containment: ".flex-container"});

        document.querySelector(config.parentId).appendChild(this._element);

    }

    isMobile() {
        const r = /Android|webOS|iPhone|iPad|iPod|BlackBerry|Opera Mini/i;
        return !!navigator.userAgent.match(r);
    }    

    hide() {
        $(".flex-container").fadeOut();    
        $(this._element).fadeOut();
        // document.querySelector(".flex-container").style.display = "none";
        this._isValid = false;
    }

    show() {
        $(this._element).fadeIn();
        // document.querySelector(".flex-container").style.display = "flex";
        $(".flex-container").slideDown();
        this._isValid = true;
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
        await this.load().then(result => {
            this._element.innerHTML = result;
        }).catch(err => {
            console.warn(err);
        });
    }

    onLoad(elem, self) {
        const parent = elem.parentNode;
        parent.querySelector(".newWindow__control-box p i").onclick = () => {
            self.hide();
        };
    }
}