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
let ToolsDatabaseCommand = class ToolsDatabaseCommand {
    action(ev) {
        alert("데이터베이스를 아직 지원하지 않습니다.");
    }
};
__decorate([
    OnMenuClick("tools-database"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ToolsDatabaseCommand.prototype, "action", null);
ToolsDatabaseCommand = __decorate([
    MenuCommand("tools", "tools-database", "데이터베이스", [])
], ToolsDatabaseCommand);
export { ToolsDatabaseCommand };
//# sourceMappingURL=ToolsDatabaseCommand.js.map