import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("tools", "tools-sound-test", "사운드 테스트", [])
export class ToolsSoundTestCommand implements IBaseMenuCommand {
    @OnMenuClick("tools-sound-test")
    action(ev: any): void {
        alert("사운드 테스트를 아직 지원하지 않습니다.");
    }
}
