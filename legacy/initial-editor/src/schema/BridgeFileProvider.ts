import { BridgeClient, getBridgeClient } from "../bridge/BridgeClient";
import {
    DataProviderCallback,
    DataProviderFileOption,
    IFileProvider,
} from "./IFileProvider";

/**
 * Initial2D 브리지 서버를 통해 게임 프로젝트 파일(scripts/, resources/)을 읽고 쓰는 제공자.
 * FileProvider(localStorage)와 같은 인터페이스라 Schema 에 그대로 꽂힌다.
 *
 * 동기 메서드(readFileSync, existsSync, writeFileSync)는 HTTP 로는 만들 수 없으므로
 * 메모리 캐시로 동작한다: 비동기로 한 번 읽거나 쓴 파일만 동기 조회가 되고,
 * writeFileSync 는 캐시를 갱신한 뒤 실제 쓰기를 백그라운드로 보낸다.
 * 새 코드는 비동기 메서드(또는 BridgeClient 자체)를 쓰는 것이 원칙이다.
 */
export class BridgeFileProvider implements IFileProvider {
    private readonly cache = new Map<string, string>();

    constructor(private readonly client: BridgeClient = getBridgeClient()) {}

    public readFile(
        filename: string,
        _encoding: string,
        callback: DataProviderCallback,
    ): void {
        this.client
            .readText(filename)
            .then((content) => {
                this.cache.set(filename, content);
                callback(null, content);
            })
            .catch((err: Error) => callback(err));
    }

    public writeFile(
        filename: string,
        content: string,
        option: DataProviderFileOption,
        callback: DataProviderCallback,
    ): void {
        if (!option) {
            callback(new Error("Invalid option"));
            return;
        }
        this.client
            .writeText(filename, content)
            .then(() => {
                this.cache.set(filename, content);
                callback(null);
            })
            .catch((err: Error) => callback(err));
    }

    public readFileSync(filename: string, _encoding: string): string {
        const cached = this.cache.get(filename);
        if (cached === undefined) {
            throw new Error(
                `File not cached: ${filename} (BridgeFileProvider 는 비동기 readFile 로 먼저 읽어야 합니다)`,
            );
        }
        return cached;
    }

    public existsSync(filename: string): boolean {
        return this.cache.has(filename);
    }

    public writeFileSync(filename: string, content: string, _encoding: string): void {
        this.cache.set(filename, content);
        this.client.writeText(filename, content).catch((err: Error) => {
            console.error(`[bridge] writeFileSync failed for ${filename}: ${err.message}`);
        });
    }

    /** 캐시를 비운다 (외부 변경 알림을 받았을 때 등) */
    public invalidate(filename?: string): void {
        if (filename === undefined) {
            this.cache.clear();
        } else {
            this.cache.delete(filename);
        }
    }
}
