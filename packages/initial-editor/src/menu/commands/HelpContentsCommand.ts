import { OnMenuClick } from "../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "./IBaseMenuCommand";
import { MenuCommand } from "../../decorators/MenuCommand";

@MenuCommand("help", "help-contents", "도움말", [])
export class HelpContentsCommand implements IBaseMenuCommand {
    @OnMenuClick("help-contents")
    action(ev: any): void {
        alert("도움말이 아직 없습니다.");
    }
}
