import "reflect-metadata";
import Container from "typedi";
import App from "./app";
import { ElectronService } from "./ElectronService";
import { ToolbarManager } from "./toolbar/Toolbar";

//==========================================================
// Main
//==========================================================
export class Main {
    static start(bindFunc: Function): void {
        window.app = App.GetInstance();
        window.electronService = Container.get(ElectronService);
        window.ToolbarManager = Container.get(ToolbarManager);
        window.app.start();
        bindFunc();
        this.update(1.0);
    }

    static update(deltaTime: number) {
        window.app.emit("update", deltaTime);
        window.requestAnimationFrame(Main.update);
    }
}

window.Main = Main;

window.onMounted = (func: Function) => {
    Main.start(func);
};
