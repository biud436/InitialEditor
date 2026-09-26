import { MenuCommand } from "../../decorators/MenuCommand";
import { IBaseMenuCommand } from "./IBaseMenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import App from "../../app";

@MenuCommand("tools", "tools-options", "환경 설정", ["ctrl", "o"])
export class ToolsOptionsCommand implements IBaseMenuCommand {
    @OnMenuClick("tools-options")
    action(ev: unknown) {
        if (App.GetInstance()) {
            App.GetInstance().emit("openWindow", {
                path: "/optionWindow",
            });
        }
    }
}
