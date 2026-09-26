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
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
/**
 * 맵 내보내기 (Ctrl+E): 경로와 이름, ID 를 정하는 대화상자를 연다.
 * 실제 쓰기는 MapDocumentService.exportTo 가 브리지 서버로 한다 (맵 포맷 v1).
 */
let FileExportCommand = class FileExportCommand {
    action(ev) {
        App.GetInstance().emit("openWindow", { path: "/exportMap" });
    }
};
__decorate([
    OnMenuClick("file-export"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FileExportCommand.prototype, "action", null);
FileExportCommand = __decorate([
    MenuCommand("file", "file-export", "파일 내보내기", ["ctrl", "e"])
], FileExportCommand);
export { FileExportCommand };
//# sourceMappingURL=FileExportCommand.js.map