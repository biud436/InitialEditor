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
 * 새 맵 (Ctrl+N): 이름, ID, 크기를 정하는 대화상자를 연다.
 * (프로젝트 자체는 브리지 서버가 서빙하는 폴더이므로 "새 프로젝트" 개념은 여기서 다루지 않는다.)
 */
let NewFileCommand = class NewFileCommand {
    action(ev) {
        if (App.GetInstance()) {
            App.GetInstance().emit("openWindow", {
                path: "/newMap",
            });
        }
    }
};
__decorate([
    OnMenuClick("file-new"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NewFileCommand.prototype, "action", null);
NewFileCommand = __decorate([
    MenuCommand("file", "file-new", "새로 만들기", ["ctrl", "n"])
], NewFileCommand);
export { NewFileCommand };
//# sourceMappingURL=NewFileCommand.js.map