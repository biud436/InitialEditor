import { MenuCommand } from "../../decorators/MenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { ElectronService } from "../../ElectronService";
import { IBaseMenuCommand as IBaseMenuCommand } from "./IBaseMenuCommand";

@MenuCommand("file", "file-open", "파일 열기", ["ctrl", "o"])
export class OpenFileCommand implements IBaseMenuCommand {
    @OnMenuClick("file-open")
    action(ev: any) {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "아직 지원하지 않는 기능입니다",
        );
    }
}
