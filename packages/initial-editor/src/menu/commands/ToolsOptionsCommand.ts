import { MenuCommand } from "../../decorators/MenuCommand";
import { IBaseMenuCommand } from "./IBaseMenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";

@MenuCommand("tools", "tools-options", "환경 설정", ["ctrl", "o"])
export class ToolsOptionsCommand implements IBaseMenuCommand {
    @OnMenuClick("tools-options")
    action(ev: unknown) {
        if (window.app) {
            window.app.emit("openWindow", {
                path: "/optionWindow",
            });
        }
    }
}
