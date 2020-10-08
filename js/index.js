import App from "./App.js";

//==========================================================
// Main
//==========================================================
class Main {
    static start() {
        $(async () => {

            if(typeof(process) !== "object") {
                alert("이제 InitialEditor는 웹에서 동작하지 않습니다.");
            }

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