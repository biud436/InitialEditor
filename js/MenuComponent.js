import {Component} from "./Component.js";

class MenuComponent extends Component {
    start() {
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

        // this.on("menu_open", (target) => {
        //     this._currentTarget = $(window.app._mouse.target);

        //     if(this._currentTarget && this._currentTarget.is(":visible")) {
    
        //         if(!target) {
        //             return;
        //         }

        //         // 현재 메뉴 액션을 가져옵니다.
        //         const actionName = target.dataset.action;
        //         $(`ul[class*=-sub]`).hide();
        //         $(`ul[class*=${actionName}]`).parent().trigger("click");
        //     } else {
        //         // 서브 메뉴가 열린 상태가 아닙니다.
        //     }
        // });        
    }

    isMenuOpen() {
        return this._isMenuOpen;
    }

    hideMenu() {
        $("#none").prop("checked", true);
        this._isMenuOpen = false;      
    }

    update(target, mouse) {
        if($(".toolbar").is('.ui-draggable-dragging')) {
            const rect = $(".toolbar").get(0).getBoundingClientRect();
        }

        // 최상위 노드를 선택합니다.
        let parentNode = target.parentNode;
        while(parentNode != null && parentNode.className != "menu__main") {
            parentNode = parentNode.parentNode;
        }

        const isSomeMenuOpened = $("ul[class*='sub']").is(":visible");

        // 최상위 노드가 메인 메뉴라면
        if(parentNode && parentNode.className === "menu__main") {
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