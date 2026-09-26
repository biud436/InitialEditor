import App from "../../../app";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

/**
 * 맵 저장 (Ctrl+S). 이미 경로가 있는 맵은 그 자리에 다시 쓰고, 처음 저장하는 맵은
 * 내보내기 대화상자로 경로를 정한다. 실제 처리는 React 셸이 "saveMap" 이벤트를 받아
 * MapDocumentService 로 수행한다 (성공과 실패를 화면에 알려야 하므로).
 */
@MenuCommand("file", "file-save", "파일 저장", ["ctrl", "s"])
export class FileSaveCommand implements IBaseMenuCommand {
    @OnMenuClick("file-save")
    action(ev: any): void {
        App.GetInstance().emit("saveMap");
    }
}
