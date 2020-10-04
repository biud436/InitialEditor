import App from "./App.js";

//==========================================================
// Main
//==========================================================
class Main {
    static start() {
        $(async () => {
            window.app = App.GetInstance();
            window.app.start();
            this.update();
        });
    }

    static update(deltaTime) {
        window.app.emit("update", deltaTime);
        window.requestAnimationFrame(Main.update);
    }    
}

Main.start();