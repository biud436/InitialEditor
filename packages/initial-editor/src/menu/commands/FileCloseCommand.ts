import { MenuCommand } from "../../decorators/MenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { ElectronService } from "../../ElectronService";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

@MenuCommand("file", "file-close", "파일 닫기", ["ctrl", "w"])
export class FileCloseCommand implements IBaseMenuCommand {
    @OnMenuClick("file-close")
    action(ev: any): void {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "아직 지원하지 않는 기능입니다",
        );
    }
}
