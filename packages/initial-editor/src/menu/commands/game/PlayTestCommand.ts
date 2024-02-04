import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("game", "game-playtest", "플레이 테스트", [])
export class PlayTestCommand implements IBaseMenuCommand {
    @OnMenuClick("game-playtest")
    action(ev: unknown) {
        alert("게임 플레이 테스트 기능은 아직 지원되지 않습니다.");
    }
}
