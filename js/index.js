// import {Component, BasicComponent} from "./component";
import Renderer from "./renderer.js";

class App {

    initMembers() {

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
                this._renderer.show();
            })
            .catch(err => {
                console.warn(err);
            });
        
    }

    start() {
        this.initMembers();
        this.initWithRenderer();
    }
}

const app = new App();
app.start();