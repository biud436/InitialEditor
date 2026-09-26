import App from "../../../app";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

/**
 * 맵 열기 (Ctrl+O): 프로젝트의 resources/maps/*.json 목록에서 골라 불러온다.
 */
@MenuCommand("file", "file-open", "파일 열기", ["ctrl", "o"])
export class OpenFileCommand implements IBaseMenuCommand {
    @OnMenuClick("file-open")
    action(ev: any) {
        App.GetInstance().emit("openWindow", { path: "/openMap" });
    }
}
