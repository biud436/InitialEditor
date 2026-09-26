import { BridgeClient } from "../bridge/BridgeClient";
import { DataProviderCallback, DataProviderFileOption, IFileProvider } from "./IFileProvider";
/**
 * Initial2D 브리지 서버를 통해 게임 프로젝트 파일(scripts/, resources/)을 읽고 쓰는 제공자.
 * FileProvider(localStorage)와 같은 인터페이스라 Schema 에 그대로 꽂힌다.
 *
 * 동기 메서드(readFileSync, existsSync, writeFileSync)는 HTTP 로는 만들 수 없으므로
 * 메모리 캐시로 동작한다: 비동기로 한 번 읽거나 쓴 파일만 동기 조회가 되고,
 * writeFileSync 는 캐시를 갱신한 뒤 실제 쓰기를 백그라운드로 보낸다.
 * 새 코드는 비동기 메서드(또는 BridgeClient 자체)를 쓰는 것이 원칙이다.
 */
export declare class BridgeFileProvider implements IFileProvider {
    private readonly client;
    private readonly cache;
    constructor(client?: BridgeClient);
    readFile(filename: string, _encoding: string, callback: DataProviderCallback): void;
    writeFile(filename: string, content: string, option: DataProviderFileOption, callback: DataProviderCallback): void;
    readFileSync(filename: string, _encoding: string): string;
    existsSync(filename: string): boolean;
    writeFileSync(filename: string, content: string, _encoding: string): void;
    /** 캐시를 비운다 (외부 변경 알림을 받았을 때 등) */
    invalidate(filename?: string): void;
}
