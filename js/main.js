/**
 * @author Eo Jinseok(biud436)
 */

class Main {
    static start() {
        $(async () => {
            const App = await import("./app.js");
            window.app = App.default.GetInstance();
            window.app.start?.();
            this.update();                
        });
    }

    static update(deltaTime) {
        window.app.update?.(deltaTime);
        window.requestAnimationFrame(Main.update);
    }    
}

Main.start();