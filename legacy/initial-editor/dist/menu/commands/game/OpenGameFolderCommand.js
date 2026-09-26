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
import { MenuCommand, OnMenuClick } from "../../../decorators";
let OpenGameFolderCommand = class OpenGameFolderCommand {
    action(ev) {
        const service = new ElectronService();
        service.openFolder();
    }
};
__decorate([
    OnMenuClick("game-folder-open"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OpenGameFolderCommand.prototype, "action", null);
OpenGameFolderCommand = __decorate([
    MenuCommand("game", "game-folder-open", "게임 폴더 열기", [])
], OpenGameFolderCommand);
export { OpenGameFolderCommand };
//# sourceMappingURL=OpenGameFolderCommand.js.map