var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { MenuCommand, OnMenuClick } from "../../../decorators";
let ModeRegionCommand = class ModeRegionCommand {
    action(ev) {
        alert("지형ID 모드가 아직 없습니다.");
    }
};
__decorate([
    OnMenuClick("mode-region"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModeRegionCommand.prototype, "action", null);
ModeRegionCommand = __decorate([
    MenuCommand("mode", "mode-region", "지역", [])
], ModeRegionCommand);
export { ModeRegionCommand };
//# sourceMappingURL=ModeRegionCommand.js.map