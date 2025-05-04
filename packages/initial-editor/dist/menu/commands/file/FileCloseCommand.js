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
let FileCloseCommand = class FileCloseCommand {
    action(ev) {
        ElectronService.getInstance().showErrorMessageBox("알림", "아직 지원하지 않는 기능입니다");
    }
};
__decorate([
    OnMenuClick("file-close"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FileCloseCommand.prototype, "action", null);
FileCloseCommand = __decorate([
    MenuCommand("file", "file-close", "파일 닫기", ["ctrl", "w"])
], FileCloseCommand);
export { FileCloseCommand };
//# sourceMappingURL=FileCloseCommand.js.map