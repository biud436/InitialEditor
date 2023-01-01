import App from "./app";
import { ElectronService } from "./ElectronService";
import { ToolbarManager } from "./toolbar/Toolbar";
import { ThemeManager } from "./ThemeManager";
import { JQueryStatic } from "jquery";
import { Main } from ".";

declare const platform: string;

declare global {
    interface Window {
        app: App;
        electronService: ElectronService;
        ToolbarManager: ToolbarManager;
        devmode: boolean;
        Main: Main;

        /**
         * 뷰와 일렉트론 렌더러를 연결하는 인터페이스 콜백 함수입니다.
         */
        onMounted: (mountEvent: () => void) => void;

        $: JQueryStatic;
    }
}
