import { OnMenuClick } from "../../decorators/OnMenuClick";
import { ElectronService } from "../../ElectronService";
import { IBaseMenuEventHandler } from "./IBaseMenuEventHandler";

export class OpenFileEventHandler implements IBaseMenuEventHandler {
    public name = "파일 열기";
    public children = {};
    public shortcut = ["ctrl", "o"];

    @OnMenuClick("file-open")
    action(ev: any) {
        ElectronService.getInstance().showErrorMessageBox(
            "알림",
            "아직 지원하지 않는 기능입니다"
        );
    }
}
