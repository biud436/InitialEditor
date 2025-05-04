import App from "../../../app";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("file", "file-new", "새로 만들기", ["ctrl", "n"])
export class NewFileCommand implements IBaseMenuCommand {
    @OnMenuClick("file-new")
    action(ev: any) {
        if (App.GetInstance()) {
            App.GetInstance().emit("openWindow", {
                path: "/newWindow",
            });
        }
    }
}
