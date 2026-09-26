interface DataProviderFileOption {
    encoding: string;
}
type DataProviderCallback = (err?: Error | null, data?: unknown) => void;
export declare class FileProvider {
    private getFilename;
    readFile(filename: string, encoding: string, callback: DataProviderCallback): void;
    writeFile(filename: string, content: string, option: DataProviderFileOption, callback: DataProviderCallback): void;
    readFileSync(filename: string, encoding: string): string;
    existsSync(filename: string): boolean;
    writeFileSync(filename: string, content: string, encoding: string): void;
}
export {};
