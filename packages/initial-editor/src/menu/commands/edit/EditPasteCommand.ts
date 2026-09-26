import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { ElectronService } from "../../../ElectronService";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

@MenuCommand("edit", "edit-paste", "붙여넣기", ["ctrl", "v"])
export class EditPasteCommand implements IBaseMenuCommand {
    @OnMenuClick("edit-paste")
    action(ev: any): void {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "붙여넣기 기능을 실행하였습니다."
        );
    }
}
