import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { ElectronService } from "../../../ElectronService";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("file", "file-preferences", "환경설정", ["ctrl", ","])
export class FilePreferencesCommand implements IBaseMenuCommand {
    @OnMenuClick("file-preferences")
    action(ev: any) {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "환경 설정 기능은 아직 지원되지 않습니다."
        );
    }
}
