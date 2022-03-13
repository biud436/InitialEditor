import { EventEmitter } from "../EventEmitter";
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

interface Status {
    currentStatus: string;
    history: string[];
}

declare global {
    export interface JQuery<TElement extends HTMLElement = HTMLElement> {
        draggable(options?: any): JQuery<TElement>;
        resizable(options?: any): JQuery<TElement>;
    }
}

class StatusProproties implements Status {
    currentStatus: string;
    history: string[];

    constructor() {
        this.currentStatus = "NORMAL";
        this.history = [this.currentStatus];
    }
}

export class ViewModel
    extends EventEmitter
    implements ViewModelImpl, LifeCycle
{
    protected _controller: BaseController;
    protected _element: JQuery<HTMLElement>;
    protected _status: StatusProproties;

    private _isReady: boolean;

    /**
     *
     */
    constructor(__controller: BaseController) {
        super();

        this._isReady = false;
        this._controller = __controller;
        this._status = new StatusProproties();

        /**
         * onCreate() ->
         * onLoad() ->
         * onRender() ->
         * onShow();
         */

        // 라이프 싸이클과 관련된 이벤트 선언
        this.on("create", (elem?: HTMLElement, ...args: any[]) =>
            this.onCreate(...args)
        )
            .on("update", (elem?: HTMLElement) => this.onUpdate(elem))
            .on("stop", (elem?: HTMLElement) => this.onStop(elem))
            .on("dispose", (elem?: HTMLElement) => this.onDispose(elem))
            .on("render", (result?: any) => this.onRender(result))
            .on("show", (elem?: JQuery<HTMLElement>) => this.onShow(elem));

        this.initMembers();
    }

    initMembers() {}

    onShow(elem?: JQuery<HTMLElement>) {
        const element = this._element;
        const controller = this._controller;
        const config = controller.config;
        if (!element) return;

        // 화면에 창을 표시합니다.
        element.show();
        $((config as Config).parentId).show();
        controller.valid();

        // 창 뒤에 표시된 라이트 박스를 감춥니다.
        $(".darken, .windows-container").css("left", "0");
    }

    onHide(elem?: JQuery<HTMLElement>) {
        const controller = this._controller;
        const config: Config = controller.config;

        this._element.hide();
        controller.invalid();
    }

    onNotify(elem?: JQuery<HTMLElement>) {}

    onCreate(...args: any[]) {
        const controller = this._controller;
        const config: Config = args[0];

        if (!config.parentId || !config.id) {
            throw new Error("The parent element is not exist!");
        }

        // HTMLDivElement를 생성합니다.
        this._element = $("<div></div>")
            .css(config as any)
            .attr("id", config.id);
        // .draggable({ snap: ".container" });

        // 화면에서 요소를 감춥니다.
        this.onHide();

        // 창의 크기를 조절가능하게 만듭니다.
        // $(`#${config.id}`).resizable({ containment: config.parentId });

        // 부모 컨테이너에 로드된 창을 추가합니다.
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

    onUpdate(elem?: HTMLElement, ...args: any[]) {}

    onStop(elem?: HTMLElement, ...args: any[]) {}

    onDispose(elem?: HTMLElement, ...args: any[]) {
        this._element.fadeOut(700, () => {
            this._element.remove();
        });
        $(".darken, .windows-container").css("left", "-9999px");
    }
}
