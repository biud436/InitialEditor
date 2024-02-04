import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("tools", "tools-resource-manager", "소재 관리자", [])
export class ToolsResourceManagerCommand implements IBaseMenuCommand {
    @OnMenuClick("tools-resource-manager")
    action(ev: unknown): void {
        alert("소재 관리를 아직 지원하지 않습니다.");
    }
}
