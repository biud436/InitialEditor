import App from "./app";
import { ToolbarManager } from "./toolbar/Toolbar";
import { ElectronService } from "./ElectronService";
import "reflect-metadata";
import Container from "typedi";

// 소스 맵 지원을 위한 코드
require("source-map-support").install();

//==========================================================
// Main
//==========================================================
class Main {
    static start(bindFunc: Function): void {
        window.onload = async () => {
            window.app = App.GetInstance();
            window.electronService = Container.get(ElectronService);
            window.ToolbarManager = Container.get(ToolbarManager);
            window.app.start();
            bindFunc();
            this.update(1.0);
        };
    }

    static update(deltaTime: number) {
        window.app.emit("update", deltaTime);
        window.requestAnimationFrame(Main.update);
    }
}

window.onMounted = (func: Function) => {
    Main.start(func);
};
