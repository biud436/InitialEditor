import { MenuCommand } from "../../decorators/MenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { ElectronService } from "../../ElectronService";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

@MenuCommand("file", "file-save", "파일 저장", ["ctrl", "s"])
export class FileSaveCommand implements IBaseMenuCommand {
  @OnMenuClick("file-save")
  action(ev: any): void {
    ElectronService.getInstance().showErrorMessageBox(
      "알림",
      "파일 저장 기능은 아직 지원하지 않습니다."
    );
  }
}
