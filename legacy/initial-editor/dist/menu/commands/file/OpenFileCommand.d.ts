import { IBaseMenuCommand } from "../IBaseMenuCommand";
/**
 * 맵 열기 (Ctrl+O): 프로젝트의 resources/maps/*.json 목록에서 골라 불러온다.
 */
export declare class OpenFileCommand implements IBaseMenuCommand {
    action(ev: any): void;
}
