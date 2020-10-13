import App from "./App";
import * as $globals from './globals';

//==========================================================
// Main
//==========================================================
class Main {
    static start() {
        $(async () => {
            $globals.app.start();
            this.update(1.0);
        });
    }

    static update(deltaTime: number) {
        $globals.app.emit("update", deltaTime);
        window.requestAnimationFrame(Main.update);
    }    
}

Main.start();