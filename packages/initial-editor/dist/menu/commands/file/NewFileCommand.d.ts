import { IBaseMenuCommand } from "../IBaseMenuCommand";
/**
 * 새 맵 (Ctrl+N): 이름, ID, 크기를 정하는 대화상자를 연다.
 * (프로젝트 자체는 브리지 서버가 서빙하는 폴더이므로 "새 프로젝트" 개념은 여기서 다루지 않는다.)
 */
export declare class NewFileCommand implements IBaseMenuCommand {
    action(ev: any): void;
}
