import { OnMenuClick } from "../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "./IBaseMenuCommand";
import { MenuCommand } from "../../decorators/MenuCommand";

@MenuCommand("help", "help-about", "버전 정보", [])
export class HelpAboutCommand implements IBaseMenuCommand {
    @OnMenuClick("help-about")
    action(ev: unknown): void {
        alert("버전 정보가 아직 없습니다.");
    }
}
