import App from "./app";
import {ToolbarManager} from "./toolbar/Toolbar";
import {ElectronService} from "./ElectronService";

// 소스 맵 지원을 위한 코드
require('source-map-support').install();

//==========================================================
// Main
//==========================================================
class Main {
    static start() {
        $(async () => {
            window.app = App.GetInstance();
            window.electronService = new ElectronService();
            window.ToolbarManager = new ToolbarManager();            
            window.app.start();
            this.update(1.0);
        });
    }

    static update(deltaTime: number) {
        window.app.emit("update", deltaTime);
        window.requestAnimationFrame(Main.update);
    }    
}

Main.start();