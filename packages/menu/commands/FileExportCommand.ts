import { ElectronService } from "../../ElectronService";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { MenuCommand } from "../../decorators/MenuCommand";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

@MenuCommand("file", "file-export", "파일 내보내기", ["ctrl", "e"])
export class FileExportCommand implements IBaseMenuCommand {
  @OnMenuClick("file-export")
  action(ev: any) {
    ElectronService.getInstance().showErrorMessageBox(
      "알림",
      "파일 내보내기 기능은 아직 지원되지 않습니다."
    );
  }
}
