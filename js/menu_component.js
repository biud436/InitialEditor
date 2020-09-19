import {Component} from "./component.js";

class MenuComponent extends Component {
    start() {
        this._isMenuOpen = false;
    }

    isMenuOpen() {
        return this._isMenuOpen;
    }

    update(target, mouse) {
        // 최상위 노드를 선택합니다.
        let parentNode = target.parentNode;
        while(parentNode != null && parentNode.className != "main") {
            parentNode = parentNode.parentNode;
        }

        // 최상위 노드가 메인 메뉴라면
        if(parentNode && parentNode.className === "main") {
            // 메뉴가 열린 것으로 간주
            this._isMenuOpen = true;
        } else {
            if(this._isMenuOpen && mouse.buttons.leftFire) {
                document.querySelector("#none").checked = true;
                this._isMenuOpen = false;
            }                                              
        }        
    }
}

export {MenuComponent};