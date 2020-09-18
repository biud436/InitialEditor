import GamePropertiesWindowController from "./renderer.js";
import { Component } from "./component.js";
import {MenuComponent, ActiveMenuWatcher} from "./menu_component.js";
import {TilesetMarker} from "./tileset_marker.js";
import Tilemap from "./canvas.js";
import GamePropertiesWindow from "./model/gamePropertiesWindow.js";

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
        this._tileId = 0;
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
        this._components.push((this._tilemap = new Tilemap()));
        this._components.forEach(component => {
            component.start();
        });

        this._tilemap.setTileId(0);
    }

    /**
     * 마우스 이벤트 및 터치 이벤트를 초기화합니다.
     */
    initWithMouseEvent() {

        window.addEventListener("mousemove", (ev) => {
            this._mouse.x = ev.clientX;
            this._mouse.y = ev.clientY;
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

    setTileId(tileId) {
        if(!this._tilemap) return;
        this._tilemap.setTileId(tileId);
    }

    /**
     * 창을 동적으로 렌더링합니다.
     */
    initWithGamePropertiesWindow() {

        // 게임 속성 창 생성하기
        this._gamePropertiesWindow = new GamePropertiesWindowController(new GamePropertiesWindow());

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

    initWithMapLayers() {
        const children = document.querySelectorAll("ul.child-tree li i");
        children.forEach(e => {
            e.onclick = function() {
                e.className = e.className.includes("slash") ? "far fa-eye":"far fa-eye-slash";
            }
        });

        children[0].parentElement.style.backgroundColor = "var(--dark-selection-color)";
    }

    start() {
        this.initMembers();
        this.initWithMouseEvent();
        this.initWithComponents();
        this.initWithGamePropertiesWindow();
        this.initWithMapLayers();
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
                    
                // 마우스 타겟 요소를 가져옵니다.
                const target = this._mouse.target;

                // 마우스 이벤트를 수신할 경우
                if(this._mouse.buttons.leftFire) {

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
                } else if(this._mouse.buttons.left) {
                    if(!target) return;
                    if(target.id == "main-canvas") {
                        component.update(this._mouse);
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

// window.onload = () => {
//     window.app.start();
//     update();
// };

$(() => {
    window.app.start();
    update();    
});