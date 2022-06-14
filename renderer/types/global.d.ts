import { JQueryStatic } from "jquery";
import type App from "./app";

export declare global {
    interface Window {
        onMounted: (func: Function) => void;
        app: App;
        $: JQueryStatic;
    }
}
