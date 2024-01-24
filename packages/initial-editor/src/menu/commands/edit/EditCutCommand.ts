import { ElectronService } from "../../../ElectronService";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("edit", "edit-cut", "잘라내기", ["ctrl", "x"])
export class EditCutCommand implements IBaseMenuCommand {
    @OnMenuClick("edit-cut")
    action(ev: any): void {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "잘라내기 기능을 실행하였습니다."
        );
    }
}
