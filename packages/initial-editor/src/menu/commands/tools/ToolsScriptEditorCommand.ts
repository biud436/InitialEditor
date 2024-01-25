import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("tools", "tools-script-editor", "스크립트 편집기", [])
export class ToolsScriptEditorCommand implements IBaseMenuCommand {
    @OnMenuClick("tools-script-editor")
    action(ev: any): void {
        alert("스크립트 편집기를 아직 지원하지 않습니다.");
    }
}
