import { IBaseMenuCommand } from "../IBaseMenuCommand";
/**
 * 스크립트 편집기 창을 연다. 실제 편집기(React, LuaEditor)는 Initial2D 브리지 서버를 통해
 * 게임 프로젝트의 scripts/*.lua 를 읽고 쓴다.
 */
export declare class ToolsScriptEditorCommand implements IBaseMenuCommand {
    action(ev: unknown): void;
}
