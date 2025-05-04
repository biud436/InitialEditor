var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { ElectronService } from "../../../ElectronService";
let FileSaveCommand = class FileSaveCommand {
    action(ev) {
        ElectronService.getInstance().showErrorMessageBox("알림", "파일 저장 기능은 아직 지원하지 않습니다.");
    }
};
__decorate([
    OnMenuClick("file-save"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FileSaveCommand.prototype, "action", null);
FileSaveCommand = __decorate([
    MenuCommand("file", "file-save", "파일 저장", ["ctrl", "s"])
], FileSaveCommand);
export { FileSaveCommand };
//# sourceMappingURL=FileSaveCommand.js.map