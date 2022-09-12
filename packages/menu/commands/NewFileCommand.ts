import { OnMenuClick } from "../../decorators/OnMenuClick";
import { IBaseMenuCommand as IBaseMenuCommand } from "./IBaseMenuCommand";

export class NewFileCommand implements IBaseMenuCommand {
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
