/**
 * @author Eo Jinseok(biud436)
 */

import App from "./App.js";

 /**
  * 옵셔널 체이닝 문법은 삼성 인터넷 브라우저에서 동작하지 않음
  */
class Main {
    static start() {
        $(async () => {
            window.app = App.GetInstance();
            window.app.start();
            this.update();                
        });
    }

    static update(deltaTime) {
        window.app.update(deltaTime);
        window.requestAnimationFrame(Main.update);
    }    
}

Main.start();