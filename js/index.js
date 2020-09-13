// import {Component, BasicComponent} from "./component";
import Renderer from "./renderer.js";
import { Component } from "./component.js";

class MenuComponent extends Component {
    start() {
        
    }
}

class ActiveMenuComponent extends Component {
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

class App {

    initMembers() {
        this.windowIds = {};
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

    initWithComponents() {
        /**
         * @type {Component[]}
         */
        this._components = [];
        this._components.push(new MenuComponent());
        this._components.push(new ActiveMenuComponent(true));
        this._components.forEach(component => {
            component.start();
        })
    }

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

    initWithRenderer() {
        this._renderer = new Renderer({
            width: "100%",
            height: "100%",
            parentId: ".flex-container",
            id: "newContainer",
            zIndex: "10",
            path: "lib/windows/context.html",
        });

        this._renderer.render()
            .then(ret => {
                this.windowIds["new-window"] = this._renderer;
                document.querySelectorAll(".file-menu-new-button").forEach(i => {
                    i.addEventListener("click", (ev) => {
                        this._renderer.show();
                        document.querySelector("#none").checked = true;
                    }, false);                    
                })
            })
            .catch(err => {
                console.warn(err);
            });
    }

    start() {
        this.initMembers();
        this.initWithMouseEvent();
        this.initWithComponents();
        this.initWithRenderer();
    }

    update(deltaTime) {
        if(deltaTime - this._now >= 400) {
            this._now = deltaTime;
        }

        this.updateComponents();
    }

    updateComponents() {
        const fire = this._mouse.buttons.leftFire;
        const isLeft = this._mouse.buttons.left;
        
        this._components.forEach(component => {
            if(!component.isActiveEvent()) {
                component.update();
            } else {
                if(fire) {
                    const target = this._mouse.target;

                    if(target) {
                        let parentNode = target.parentNode;
                        while(parentNode != null && parentNode.className != "main") {
                            parentNode = parentNode.parentNode;
                        }
                        if(parentNode && parentNode.className === "main") {
                            this._isMenuOpen = true;
                        } else {
                            if(this._isMenuOpen && fire) {
                                component.update();
                                document.querySelector("#none").checked = true;
                                this._isMenuOpen = false;
                            }             
                        }
                    }
                }
                
            }
        });
    }

    onLoad(elem, id) {
        if(this.windowIds[id]) {
            const self = this.windowIds[id];
            this.windowIds[id].onLoad(elem, self);
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
window.app = new App();
window.app.start();

function update(deltaTime) {
    window.app.update(deltaTime);
    window.requestAnimationFrame(update);
}

update();