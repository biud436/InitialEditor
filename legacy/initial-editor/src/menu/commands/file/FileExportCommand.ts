import App from "../../../app";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

/**
 * 맵 내보내기 (Ctrl+E): 경로와 이름, ID 를 정하는 대화상자를 연다.
 * 실제 쓰기는 MapDocumentService.exportTo 가 브리지 서버로 한다 (맵 포맷 v1).
 */
@MenuCommand("file", "file-export", "파일 내보내기", ["ctrl", "e"])
export class FileExportCommand implements IBaseMenuCommand {
    @OnMenuClick("file-export")
    action(ev: any) {
        App.GetInstance().emit("openWindow", { path: "/exportMap" });
    }
}
