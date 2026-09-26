import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("game", "game-show-console", "콘솔 표시", [])
export class ShowConsoleCommand implements IBaseMenuCommand {
    @OnMenuClick("game-show-console")
    action(ev: unknown) {
        alert("콘솔 표시 기능은 아직 지원되지 않습니다.");
    }
}
