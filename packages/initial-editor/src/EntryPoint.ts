import "reflect-metadata";
import Container from "typedi";
import App from "./app";
import { ElectronService } from "./ElectronService";
import { ToolbarManager } from "./toolbar/Toolbar";

//==========================================================
// Main
//==========================================================
export class Main {
    public static app: App = App.GetInstance();

    static start(bindFunc: Function): void {
        window.electronService = Container.get(ElectronService);
        window.ToolbarManager = Container.get(ToolbarManager);
        App.GetInstance().start();
        bindFunc();
        this.update(1.0);
    }

    static update(deltaTime: number) {
        App.GetInstance().emit("update", deltaTime);
        window.requestAnimationFrame(Main.update.bind(this));
    }
}

// window.Main = Main;

// window.onMounted = (func: Function) => {
//     Main.start(func);
// };
