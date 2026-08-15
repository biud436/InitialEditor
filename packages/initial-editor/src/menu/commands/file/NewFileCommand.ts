import App from "../../../app";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

/**
 * 새 맵 (Ctrl+N): 이름, ID, 크기를 정하는 대화상자를 연다.
 * (프로젝트 자체는 브리지 서버가 서빙하는 폴더이므로 "새 프로젝트" 개념은 여기서 다루지 않는다.)
 */
@MenuCommand("file", "file-new", "새로 만들기", ["ctrl", "n"])
export class NewFileCommand implements IBaseMenuCommand {
    @OnMenuClick("file-new")
    action(ev: any) {
        if (App.GetInstance()) {
            App.GetInstance().emit("openWindow", {
                path: "/newMap",
            });
        }
    }
}
