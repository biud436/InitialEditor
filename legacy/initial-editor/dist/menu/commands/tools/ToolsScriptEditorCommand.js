var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import App from "../../../app";
import { MenuCommand, OnMenuClick } from "../../../decorators";
/**
 * 스크립트 편집기 창을 연다. 실제 편집기(React, LuaEditor)는 Initial2D 브리지 서버를 통해
 * 게임 프로젝트의 scripts/*.lua 를 읽고 쓴다.
 */
let ToolsScriptEditorCommand = class ToolsScriptEditorCommand {
    action(ev) {
        App.GetInstance().emit("openWindow", { path: "/scriptEditor" });
    }
};
__decorate([
    OnMenuClick("tools-script-editor"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ToolsScriptEditorCommand.prototype, "action", null);
ToolsScriptEditorCommand = __decorate([
    MenuCommand("tools", "tools-script-editor", "스크립트 편집기", [])
], ToolsScriptEditorCommand);
export { ToolsScriptEditorCommand };
//# sourceMappingURL=ToolsScriptEditorCommand.js.map