import { OnMenuClick } from "../../decorators/OnMenuClick";
import { ElectronService } from "../../ElectronService";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

export class FileExitCommand implements IBaseMenuCommand {
    name = "프로그램 종료";
    children = {};
    shortcut = ["ctrl", "q"];

    @OnMenuClick("file-exit")
    action(ev: any) {
        const service = ElectronService.getInstance();
        service.quit();
    }
}
