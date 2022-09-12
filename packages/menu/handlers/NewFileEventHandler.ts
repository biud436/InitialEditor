import { OnMenuClick } from "../../decorators/OnMenuClick";
import { IBaseMenuEventHandler } from "./IBaseMenuEventHandler";

export class NewFileEventHandler implements IBaseMenuEventHandler {
    name: string = "새로 만들기";
    children?: Record<string, any> = {};
    shortcut: string[] = ["ctrl", "n"];

    @OnMenuClick("file-new")
    action(ev: any) {
        if (window.app) {
            window.app.emit("openWindow", {
                path: "/newWindow",
            });
        }
    }
}
