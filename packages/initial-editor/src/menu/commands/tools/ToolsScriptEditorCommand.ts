import App from "../../../app";
import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

/**
 * 스크립트 편집기 창을 연다. 실제 편집기(React, LuaEditor)는 Initial2D 브리지 서버를 통해
 * 게임 프로젝트의 scripts/*.lua 를 읽고 쓴다.
 */
@MenuCommand("tools", "tools-script-editor", "스크립트 편집기", [])
export class ToolsScriptEditorCommand implements IBaseMenuCommand {
    @OnMenuClick("tools-script-editor")
    action(ev: unknown): void {
        App.GetInstance().emit("openWindow", { path: "/scriptEditor" });
    }
}
