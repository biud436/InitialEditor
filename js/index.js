import Renderer from "./renderer.js";
import { Component } from "./component.js";

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

/**
 * @class TilesetMarker
 */
class TilesetMarker extends Component {
    initMembers() {
        this._tileWidth = 16;
        this._tileHeight = 16;
        this._isReady = false;
        
        this.initWithElement();
        this.active();
    }

    initWithElement() {
        const parent = document.querySelector("#view");
        let child = null;
        if((child = document.querySelector("#tileset-marker"))) {
            parent.removeChild(child);
            return;
        }

        this._element = document.createElement("div");
        this._element.id = "tileset-marker";
        this._element.style.minWidth = "16px";
        this._element.style.minHeight = "16px";
        this._element.style.width = "16px";
        this._element.style.height = "16px";
        this._element.style.position = "absolute";
        this._element.style.top = "0";
        this._element.style.left = "0";
        this._element.style.margin = "0";
        this._element.style.padding = "0";
        this._element.style.border = "2px dotted white";
        this._element.style.zIndex = "50";
        this._element.style.boxSizing = "border-box";

        this._isReady = true;
        
        parent.appendChild(this._element);
    }

    start() {
        
    }

    update(...args) {
        if(!this._isReady) {
            return;
        }

        const parent = document.querySelector("#view");
        const img = parent.querySelector("img");
        const tileset = getComputedStyle(img);
        const tilesetWidth = img.width;
        const tilesetHeight = img.height;
        const topY = 48;

        const mouse = args[0];

        const tw = 16;
        const th = 16;
        let nx = Math.floor(mouse.x / tw) * tw;
        let ny = Math.floor(mouse.y / th) * th;

        const mapCols = tilesetWidth / tw;
        const mapRows = tilesetHeight / th;    
        const cursorCols = parseInt(this._element.style.left) / tw;
        const cursorRows = parseInt(this._element.style.top) / th;
        const targetX = nx / tw;
        const targetY = ny / th;

        if(nx < 0) {
            nx = 0;
        }
        if(nx > tilesetWidth - tw) {
            nx = tilesetWidth - tw;
        }
        if(ny < 0) {
            ny = 0;
        }
        if(ny > tilesetHeight) {
            ny = tilesetHeight - th + topY;
        }

        this._element.style.position = "absolute";
        this._element.style.left = nx + "px";
        this._element.style.top = ny - topY + "px";
    }

}

class App {

    /**
     * 멤버 변수를 초기화합니다.
     */
    initMembers() {
        this.cache = {};
        this._mouse = {
            x: 0,
            y: 0,
            buttons: {
                left: false,
                leftFire: false,
            },
            target: null,
        };
        this._now = performance.now();
        this._isMenuOpen = false;
    }

    /**
     * 컴포넌트를 초기화합니다.
     */
    initWithComponents() {
        /**
         * @type {Component[]}
         */
        this._components = [];
        this._components.push(new MenuComponent());
        this._components.push(new ActiveMenuWatcher(true));
        this._components.push(new TilesetMarker(true));
        this._components.forEach(component => {
            component.start();
        })
    }

    /**
     * 마우스 이벤트 및 터치 이벤트를 초기화합니다.
     */
    initWithMouseEvent() {

        window.addEventListener("mousemove", (ev) => {
            this._mouse.x = ev.pageX;
            this._mouse.y = ev.pageY;
        }, false);

        window.addEventListener("mousedown", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = true;
                this._mouse.buttons.leftFire = false;
                this._mouse.target = ev.target;
            }
        }, false);

        window.addEventListener("mouseup", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = false;
                this._mouse.buttons.leftFire = true;
            }
        }, false);

        window.addEventListener("touchstart", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = true;
            }
        }, false);        

        window.addEventListener("touchend", (ev) => {
            if(ev.button == 0) {
                this._mouse.buttons.left = false;
            }
        }, false);      

    }

    /**
     * 창을 동적으로 렌더링합니다.
     */
    initWithGamePropertiesWindow() {

        // 게임 속성 창 생성하기
        this._gamePropertiesWindow = new Renderer({
            width: "100%",
            height: "100%",
            parentId: ".flex-container",
            id: "newContainer",
            zIndex: "10",
            path: "view/windows/context.html",
        });

        // 동적으로 HTML 과 CSS 데이터를 가져옵니다.
        this._gamePropertiesWindow.render()
            .then(ret => {

                // 로딩이 성공적으로 완료되었다면 창 데이터를 현재 렌더러에 캐시합니다.
                this.cache["new-window"] = this._gamePropertiesWindow;

                // 파일 메뉴 버튼이 눌렸을 때의 액션을 처리합니다.
                document.querySelectorAll(".file-menu-new-button").forEach(i => {
                    i.addEventListener("click", (ev) => {
                        // 창을 화면에 보이게 합니다.
                        this._gamePropertiesWindow.show();
                        // 펼쳐진 메뉴를 다시 접습니다.
                        document.querySelector("#none").checked = true;
                    }, false);                    
                })
            })
            .catch(err => {
                console.warn(err);
            });
    }

    initWithAlertWindow() {

        // this._alertWindow = new Renderer({
        //     width: "100%",
        //     height: "100%",
        //     parentId: ".flex-container",
        //     id: "alertWindowContainer",
        //     zIndex: "10",
        //     path: "view/windows/alert.html",            
        // });

        // this._alertWindow.render()
        //     .then(ret => {
        //         this.cache["alert-window"] = this._alertWindow;
        //         this._alertWindow.show();
        //     }).catch(err => {

        //     });
    }

    start() {
        this.initMembers();
        this.initWithMouseEvent();
        this.initWithComponents();
        this.initWithGamePropertiesWindow();
        this.initWithAlertWindow();
    }

    /**
     * 매 프레임마다 반복 실행되는 메소드입니다.
     * @param {Number}} deltaTime 
     */
    update(deltaTime) {
        // 400ms가 지났을 때 마다 무언가를 실행한다.
        if(deltaTime - this._now >= 400) {
            this._now = deltaTime;
        }

        this.updateComponents();
        this._mouse.buttons.leftFire = false;
    }

    updateComponents() {
        // 왼쪽 마우스 또는 터치 버튼이 눌렸는가?
        
        this._components.forEach(component => {
            if(!component.isActiveEvent()) {
                // 마우스 이벤트를 수신하지 않을 경우,
                component.update();
            } else {
                // 마우스 이벤트를 수신할 경우
                if(this._mouse.buttons.leftFire) {

                    // 마우스 타겟 요소를 가져옵니다.
                    const target = this._mouse.target;

                    if(target) {

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
                            // 왼쪽 마우스 버튼이 눌렸을 때
                            if(this._isMenuOpen && this._mouse.buttons.leftFire) {
                                component.update(this._mouse);
                                document.querySelector("#none").checked = true;
                                this._isMenuOpen = false;
                            }
                            if(target.id == "view" && this._mouse.buttons.leftFire) {
                                component.update(this._mouse);
                            }                            
                        }
                    }
                }
                
            }
        });
    }

    /**
     * 
     * @param {HTMLElement} elem 
     * @param {Number} id 
     */
    onLoad(elem, id) {
        if(this.cache[id]) {
            const self = this.cache[id];
            this.cache[id].onLoad(elem, self);
        }
    }

    static GetInstance() {
        if(!App.Instance) {
            App.Instance = new App();
        }
        
        return App.Instance;
    }
}

App.Instance = null;
window.app = App.GetInstance();

function update(deltaTime) {
    window.app.update(deltaTime);
    window.requestAnimationFrame(update);
}

window.onload = () => {
    window.app.start();
    update();
};
