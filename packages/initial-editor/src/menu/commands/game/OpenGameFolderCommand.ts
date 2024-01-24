import { ElectronService } from "../../../ElectronService";
import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("game", "game-folder-open", "게임 폴더 열기", [])
export class OpenGameFolderCommand implements IBaseMenuCommand {
    @OnMenuClick("game-folder-open")
    action(ev: any) {
        const service = new ElectronService();
        service.openFolder();
    }
}
