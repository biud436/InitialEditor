import { Component } from "./Component";

interface Mouse {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    buttons: {
        left: boolean;
        leftFire: boolean;
    };
    target: HTMLElement;
    menuTarget: HTMLElement;
}

export namespace InitialEditor {
    export interface Point {
        x: number;
        y: number;
    }
}

/**
 * @class MenuComponent
 * @description
 * 메뉴 컴포넌트 클래스는 메뉴가 열려있는 지 닫혀있는 지 판단합니다.
 */
class MenuComponent extends Component {
    public _isMenuOpen: boolean;
    private _originalPos: InitialEditor.Point;
    private _currentTarget?: JQuery<HTMLElement>;

    start(...args: any[]) {
        this._isMenuOpen = false;

        // 툴바를 드래그 가능한 상태로 변경합니다.
        // @ts-ignore
        $(".toolbar").draggable({ snap: ".menu" });

        // 사이드 탭 (타일셋 뷰)의 폭을 조절할 수 있게 합니다.
        // @ts-ignore
        $(".aside__tabs").resizable({
            containment: "#aside",
        });

        // 툴바의 크기를 가져옵니다.
        const rect = <DOMRect>$(".toolbar").get(0).getBoundingClientRect();
        const { x, y } = rect;

        this._originalPos = <InitialEditor.Point>{
            x,
            y,
        };

        this._currentTarget = null;

        return this;
    }

    isMenuOpen() {
        return this._isMenuOpen;
    }

    hideMenu() {
        $("#none").prop("checked", true);
        this._isMenuOpen = false;
    }

    update(target: HTMLElement, mouse: Mouse) {
        if ($(".toolbar").is(".ui-draggable-dragging")) {
            const rect = $(".toolbar").get(0).getBoundingClientRect();
        }

        // 최상위 노드를 선택합니다.
        /**
         * @type {HTMLElement}
         */
        let parentNode = target.parentNode;

        while (
            parentNode != null &&
            (<Element>parentNode).className != "menu__main"
        ) {
            parentNode = parentNode.parentNode;
        }

        const isSomeMenuOpened = $("ul[class*='sub']").is(":visible");

        // 최상위 노드가 메인 메뉴라면
        if (parentNode && (<Element>parentNode).className === "menu__main") {
            // 메뉴가 열린 것으로 간주
            this._isMenuOpen = true;
        } else {
            if (this._isMenuOpen && mouse.buttons.leftFire) {
                this.hideMenu();
            }
        }
    }
}

export { MenuComponent };
