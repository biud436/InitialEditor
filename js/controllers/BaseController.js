
/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class BaseController {

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

        this._element = $("<div></div>")
            .css(config)
            .attr("id", config.id)
            .draggable({ snap: ".container" });

        this.hide();

        $(`#${config.id}`).resizable({containment: config.parentId});

        $(config.parentId).append(this._element);

    }

    isMobile() {
        const r = /Android|webOS|iPhone|iPad|iPod|BlackBerry|Opera Mini/i;
        return !!navigator.userAgent.match(r);
    }    

    hide() {
        $(this._config.parentId).fadeOut();    
        this._element.fadeOut();
        this._isValid = false;
    }

    show() {
        this._element.fadeIn();
        $(this._config.parentId).slideDown();
        this._isValid = true;
    }    

    remove() {
        this._element.fadeOut(700, () => {
            this._element.remove();
        });
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
        await this.load().then(result => {
            this._element.html(result);
        }).catch(err => {
            console.warn(err);
        });
    }

    onLoad(elem, self) {
        this.addEventHandlers(elem, self);
    }    

    addEventHandlers() {

    }

}