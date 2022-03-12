import App from "./App";
import { ToolbarManager } from "./toolbar/Toolbar";
import { ElectronService } from "./ElectronService";
import { VueBinder } from "./VueBinder";
import "reflect-metadata";
import Container from "typedi";

// 소스 맵 지원을 위한 코드
require("source-map-support").install();

//==========================================================
// Main
//==========================================================
class Main {
    static start(bindFunc: Function) {
        $(async () => {
            window.app = App.GetInstance();
            window.electronService = Container.get(ElectronService);
            window.ToolbarManager = Container.get(ToolbarManager);
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
