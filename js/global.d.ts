import App from "./app";
import {ElectronService} from "./ElectronService";

declare const platform: string;

declare global {
    interface Window {
        app: App;
        electronService: ElectronService;
    }
}