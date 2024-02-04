import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("mode", "mode-event", "이벤트", [])
export class ModeEventCommand implements IBaseMenuCommand {
    @OnMenuClick("mode-event")
    action(ev: unknown): void {
        alert("이벤트 모드가 아직 없습니다.");
    }
}
