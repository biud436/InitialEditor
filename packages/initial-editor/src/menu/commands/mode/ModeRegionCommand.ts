import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("mode", "mode-region", "지역", [])
export class ModeRegionCommand implements IBaseMenuCommand {
    @OnMenuClick("mode-region")
    action(ev: unknown): void {
        alert("지형ID 모드가 아직 없습니다.");
    }
}
