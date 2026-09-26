import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("mode", "mode-map", "지도", [])
export class ModeMapCommand implements IBaseMenuCommand {
    @OnMenuClick("mode-map")
    action(ev: unknown): void {
        alert("지도 모드가 아직 없습니다.");
    }
}
