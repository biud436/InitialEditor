import { JQueryStatic } from "jquery";
import type App from "./app";
// import ThemeManager from "./ThemeManager";

export declare global {
    interface Window {
        onMounted: (mountEvent: () => void) => void;
        app: App;
        // ThemeManager: ThemeManager;
        $: JQueryStatic;
    }
}
