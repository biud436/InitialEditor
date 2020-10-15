import {EventEmitter} from "../EventEmitter";
import BaseController from "../controllers/BaseController";

interface ViewModelImpl {
    onShow(elem?: JQuery<HTMLElement>): void;
    onHide(elem?: JQuery<HTMLElement>): void;
    onNotify(elem?: JQuery<HTMLElement>): void;
    initMembers(): void;
}

interface LifeCycle {
    onCreate(elem?: HTMLElement, ...args: any[]): void;
    onUpdate(elem?: HTMLElement, ...args: any[]): void;
    onStop(elem?: HTMLElement, ...args: any[]): void;
    onDispose(elem?: HTMLElement, ...args: any[]): void;
}

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

export class ViewModel extends EventEmitter implements ViewModelImpl, LifeCycle {

    protected _controller: BaseController;
    protected _element: JQuery<HTMLElement>;

    private _isReady: boolean;

    /**
     * 
     */
    constructor(__controller : BaseController) {
        super();
        
        this._isReady = false;
        this._controller = __controller;

        // 라이프 싸이클과 관련된 이벤트 선언
        this.on("create", (elem?: HTMLElement, ...args: any[]) => this.onCreate(elem, ...args))
            .on("update", (elem?: HTMLElement)  => this.onUpdate(elem))
            .on("stop", (elem?: HTMLElement)  => this.onStop(elem))
            .on("dispose", (elem?: HTMLElement)  => this.onDispose(elem))
            .on("render", (result?: any) => this.onRender(result))
            .on("show", (elem?: JQuery<HTMLElement>)  => this.onShow(elem))

        this.initMembers();

    }

    initMembers() {

    }

    onShow(elem?: JQuery<HTMLElement>) {
        const element = this._element;
        const controller = this._controller;
        const config = controller.config;
        if(!element) return;

        element.show();
        $((config as Config).parentId).show();
        controller.valid();
        $(".darken, .windows-container").css("left", "0");
    }

    onHide(elem?: JQuery<HTMLElement>)  {
        const controller = this._controller;
        const config : Config = controller.config;

        this._element.hide();
        controller.invalid();
    }

    onNotify(elem?: JQuery<HTMLElement>) {

    }
    
    onCreate(elem?: HTMLElement, ...args: any[]) {
        const controller = this._controller;
        const config : Config = args[0]; 
        
        if(!config.parentId || !config.id) {
            throw new Error("The parent element is not exist!");
        }

        // HTMLDivElement를 생성합니다.
        this._element = $("<div></div>")
            .css(config as any)
            .attr("id", config.id)
            .draggable({ snap: ".container" });

        this.onHide();

        $(`#${config.id}`).resizable({containment: config.parentId});

        $(config.parentId).append(this._element);     

        this._isReady = true;      
    }

    /**
     * HTML 파일로부터 도큐먼트를 렌더링합니다.
     * @param result 
     */
    onRender(result?: any) {
        this._element.html(result);
    }

    onUpdate(elem?: HTMLElement, ...args: any[]) {

    }

    onStop(elem?: HTMLElement, ...args: any[]) {

    }

    onDispose(elem?: HTMLElement, ...args: any[]) {
        this._element.fadeOut(700, () => {
            this._element.remove();
        });
        $(".darken, .windows-container").css("left", "-9999px");
    }

}