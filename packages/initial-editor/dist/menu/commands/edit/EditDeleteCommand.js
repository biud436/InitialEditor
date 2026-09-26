var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ElectronService } from "../../../ElectronService";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
let EditDeleteCommand = class EditDeleteCommand {
    action(ev) {
        ElectronService.getInstance().showErrorMessageBox("알림", "삭제 기능을 실행하였습니다.");
    }
};
__decorate([
    OnMenuClick("edit-delete"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EditDeleteCommand.prototype, "action", null);
EditDeleteCommand = __decorate([
    MenuCommand("edit", "edit-deletee", "삭제하기", ["ctrl", "d"])
], EditDeleteCommand);
export { EditDeleteCommand };
//# sourceMappingURL=EditDeleteCommand.js.map