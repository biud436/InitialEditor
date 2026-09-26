import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { ElectronService } from "../../../ElectronService";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("edit", "edit-copy", "복사하기", ["ctrl", "c"])
export class EditCopyCommand implements IBaseMenuCommand {
    @OnMenuClick("edit-copy")
    action(ev: any): void {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "복사하기 기능을 실행하였습니다."
        );
    }
}
