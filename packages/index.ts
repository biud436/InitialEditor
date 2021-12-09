import App from "./app";
import { ToolbarManager } from "./toolbar/Toolbar";
import { ElectronService } from "./ElectronService";
import { VueBinder } from "./VueBinder";

// 소스 맵 지원을 위한 코드
require("source-map-support").install();

//==========================================================
// Main
//==========================================================
class Main {
    static start(bindFunc: Function) {
        $(async () => {
            window.app = App.GetInstance();
            window.electronService = new ElectronService();
            window.ToolbarManager = new ToolbarManager();
            window.app.start();
            bindFunc();
            this.update(1.0);
        });
    }

    static update(deltaTime: number) {
        window.app.emit("update", deltaTime);
        window.requestAnimationFrame(Main.update);
    }
}

(window as any).onMounted = (func: Function) => {
    Main.start(func);
};

const vue = new VueBinder();
vue.mount();
