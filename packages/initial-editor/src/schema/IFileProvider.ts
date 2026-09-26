export interface DataProviderFileOption {
    encoding: string;
}

export type DataProviderCallback = (err?: Error | null, data?: unknown) => void;

/**
 * 스키마가 파일을 읽고 쓰는 통로. 구현체는 둘이다.
 * - FileProvider: localStorage (에디터 자체 설정처럼 브라우저에 남겨도 되는 것)
 * - BridgeFileProvider: Initial2D 브리지 서버 (게임 프로젝트의 scripts/, resources/)
 */
export interface IFileProvider {
    readFile(filename: string, encoding: string, callback: DataProviderCallback): void;
    writeFile(
        filename: string,
        content: string,
        option: DataProviderFileOption,
        callback: DataProviderCallback,
    ): void;
    readFileSync(filename: string, encoding: string): string;
    existsSync(filename: string): boolean;
    writeFileSync(filename: string, content: string, encoding: string): void;
}
