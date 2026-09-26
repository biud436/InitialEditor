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
 * 맵 저장 (Ctrl+S). 이미 경로가 있는 맵은 그 자리에 다시 쓰고, 처음 저장하는 맵은
 * 내보내기 대화상자로 경로를 정한다. 실제 처리는 React 셸이 "saveMap" 이벤트를 받아
 * MapDocumentService 로 수행한다 (성공과 실패를 화면에 알려야 하므로).
 */
let FileSaveCommand = class FileSaveCommand {
    action(ev) {
        App.GetInstance().emit("saveMap");
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