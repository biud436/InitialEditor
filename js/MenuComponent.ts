import {Component} from "./Component";

interface Mouse {
    x: number,
    y: number, 
    screenX : number,
    screenY : number,
    buttons: {
        left: boolean,
        leftFire: boolean,
    },       
    target: HTMLElement,
    menuTarget: HTMLElement,
};

class MenuComponent extends Component {

    public _isMenuOpen: boolean;
    private _originalPos: {x:number, y:number};
    private _currentTarget: JQuery<HTMLElement>;

    start(...args:any[]) {
        this._isMenuOpen = false;
        $(".toolbar").draggable({ snap: ".menu" });
        $(".aside__tabs").resizable({
            containment: "#aside"
        });

        const rect = $(".toolbar").get(0).getBoundingClientRect();
        this._originalPos = {
            x: rect.x,
            y: rect.y
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
        if($(".toolbar").is('.ui-draggable-dragging')) {
            const rect = $(".toolbar").get(0).getBoundingClientRect();
        }

        // 최상위 노드를 선택합니다.
        /**
         * @type {HTMLElement}
         */
        let parentNode = target.parentNode;

        while(parentNode != null && (<Element>parentNode).className != "menu__main") {
            parentNode = parentNode.parentNode;
        }

        const isSomeMenuOpened = $("ul[class*='sub']").is(":visible");

        // 최상위 노드가 메인 메뉴라면
        if(parentNode && (<Element>parentNode).className === "menu__main") {
            // 메뉴가 열린 것으로 간주
            this._isMenuOpen = true;
        } else {
            if(this._isMenuOpen && mouse.buttons.leftFire) {
                this.hideMenu();
            }                                              
        }        
        
    }
}

export {MenuComponent};