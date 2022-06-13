import { JQueryStatic } from "jquery";

export declare global {
    interface Window {
        onMounted: (func: Function) => void;
        app: App;
        $: JQueryStatic;
    }
}
