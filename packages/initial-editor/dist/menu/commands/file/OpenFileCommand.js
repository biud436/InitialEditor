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
 * 맵 열기 (Ctrl+O): 프로젝트의 resources/maps/*.json 목록에서 골라 불러온다.
 */
let OpenFileCommand = class OpenFileCommand {
    action(ev) {
        App.GetInstance().emit("openWindow", { path: "/openMap" });
    }
};
__decorate([
    OnMenuClick("file-open"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OpenFileCommand.prototype, "action", null);
OpenFileCommand = __decorate([
    MenuCommand("file", "file-open", "파일 열기", ["ctrl", "o"])
], OpenFileCommand);
export { OpenFileCommand };
//# sourceMappingURL=OpenFileCommand.js.map