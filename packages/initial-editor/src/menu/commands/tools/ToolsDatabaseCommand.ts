import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("tools", "tools-database", "데이터베이스", [])
export class ToolsDatabaseCommand implements IBaseMenuCommand {
    @OnMenuClick("tools-database")
    action(ev: unknown): void {
        alert("데이터베이스를 아직 지원하지 않습니다.");
    }
}
