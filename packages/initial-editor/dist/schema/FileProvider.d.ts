import { DataProviderCallback, DataProviderFileOption, IFileProvider } from "./IFileProvider";
/**
 * localStorage 기반 파일 제공자. 에디터 자체 설정(테마, 레이어 구성)처럼 브라우저에
 * 남겨도 되는 것에 쓴다. 게임 프로젝트 파일은 BridgeFileProvider 를 쓴다.
 */
export declare class FileProvider implements IFileProvider {
    private getFilename;
    readFile(filename: string, encoding: string, callback: DataProviderCallback): void;
    writeFile(filename: string, content: string, option: DataProviderFileOption, callback: DataProviderCallback): void;
    readFileSync(filename: string, encoding: string): string;
    existsSync(filename: string): boolean;
    writeFileSync(filename: string, content: string, encoding: string): void;
}
