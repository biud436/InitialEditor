import App from "./app";
import { ElectronService } from "./ElectronService";
import { ToolbarManager } from "./toolbar/Toolbar";

declare const platform: string;

declare global {
    interface Window {
        app: App;
        electronService: ElectronService;
        ToolbarManager: ToolbarManager;
        devmode: boolean;
        onMounted: (mountEvent: () => void) => void;
    }
}
