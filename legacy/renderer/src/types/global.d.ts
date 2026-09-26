import { JQueryStatic } from "jquery";
import type App from "./app";
import type Main from "./";
// import ThemeManager from "./ThemeManager";

export declare global {
    interface Window {
        onMounted: (mountEvent: () => void) => void;
        app: App;
        Main: Main;
        // ThemeManager: ThemeManager;
        $: JQueryStatic;
    }
}
