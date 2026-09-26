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
let HelpContentsCommand = class HelpContentsCommand {
    action(ev) {
        alert("도움말이 아직 없습니다.");
    }
};
__decorate([
    OnMenuClick("help-contents"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HelpContentsCommand.prototype, "action", null);
HelpContentsCommand = __decorate([
    MenuCommand("help", "help-contents", "도움말", [])
], HelpContentsCommand);
export { HelpContentsCommand };
//# sourceMappingURL=HelpContentsCommand.js.map