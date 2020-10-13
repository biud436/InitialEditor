import App from "./App";
import * as $globals from './globals';

declare global {
    interface Window {
      app: App;
    }
  }

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