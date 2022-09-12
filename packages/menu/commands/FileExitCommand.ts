import { MenuCommand } from "../../decorators/MenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { ElectronService } from "../../ElectronService";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

@MenuCommand("file", "file-exit", "프로그램 종료", ["ctrl", "q"])
export class FileExitCommand implements IBaseMenuCommand {
    @OnMenuClick("file-exit")
    action(ev: any) {
        const service = ElectronService.getInstance();
        service.quit();
    }
}
