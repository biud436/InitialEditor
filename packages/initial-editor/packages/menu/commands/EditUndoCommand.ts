import { ElectronService } from "../../ElectronService";
import { MenuCommand } from "../../decorators/MenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

@MenuCommand("edit", "edit-undo", "실행 취소", ["ctrl", "z"])
export class EditUndoCommand implements IBaseMenuCommand {
    @OnMenuClick("edit-undo")
    action(ev: any): void {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "실행 취소 기능을 실행하였습니다"
        );
    }
}
