var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { MenuCommand } from "../../decorators/MenuCommand";
let HelpAboutCommand = class HelpAboutCommand {
    action(ev) {
        alert("버전 정보가 아직 없습니다.");
    }
};
__decorate([
    OnMenuClick("help-about"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HelpAboutCommand.prototype, "action", null);
HelpAboutCommand = __decorate([
    MenuCommand("help", "help-about", "버전 정보", [])
], HelpAboutCommand);
export { HelpAboutCommand };
//# sourceMappingURL=HelpAboutCommand.js.map