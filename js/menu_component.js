import {Component} from "./component.js";

class MenuComponent extends Component {
    start() {
        
    }
}

/**
 * @class ActiveMenuWacther
 * @description 펼침(활성화) 상태인 메뉴의 태그명을 확인합니다.
 */
class ActiveMenuWatcher extends Component {
    initMembers() {
        this._count = 0;
    }
    start() {
        this.active();
    }
    update(...args) {
        const mouse = window.app._mouse;
        const target = mouse.target;

        if(target) {
            if(target.tagName.toLowerCase() === "li") {
                
            }
        }
    }
}

export {MenuComponent, ActiveMenuWatcher};