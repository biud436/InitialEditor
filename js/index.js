// import {Component, BasicComponent} from "./component";
import Renderer from "./renderer.js";

class App {

    initMembers() {
        this.windowIds = {};
    }

    initWithRenderer() {
        this._renderer = new Renderer({
            // display: "relative",
            // x: "50%",
            // y: "50px",
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
                    i.addEventListener("click", () => {
                        this._renderer.show();
                    }, false);                    
                })
            })
            .catch(err => {
                console.warn(err);
            });
    }

    start() {
        this.initMembers();
        this.initWithRenderer();
    }

    onLoad(elem, id) {
        if(this.windowIds[id]) {
            const self = this.windowIds[id];
            this.windowIds[id].onLoad(elem, self);
        }
    }
}

window.app = new App();
window.app.start();