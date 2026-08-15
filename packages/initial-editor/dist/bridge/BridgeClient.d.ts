/**
 * Initial2D 브리지 서버 클라이언트.
 *
 * 브리지 서버(Initial2D 저장소의 tools/bridge/server.js, 기본 127.0.0.1:5960)는 게임 프로젝트의
 * scripts/ 와 resources/ 를 HTTP 로 읽고 쓰게 하고, 저장한 스크립트를 실행 중인 게임에 push(HMR)한다.
 * 이 클래스는 그 API 를 감싼 얇은 래퍼다. 서버 주소는 localStorage 의 `initial-editor.bridge-url`
 * 로 바꿀 수 있다.
 */
export declare const BRIDGE_URL_STORAGE_KEY = "initial-editor.bridge-url";
export declare const DEFAULT_BRIDGE_URL = "http://127.0.0.1:5960";
export interface BridgeHealth {
    ok: boolean;
    name: string;
    version: string;
    project: string;
}
export interface BridgeProjectInfo {
    name: string;
    root: string;
    bridgeVersion: string;
    allowedDirs: string[];
    /** scripts/**\/*.lua (프로젝트 루트 기준 상대 경로) */
    scripts: string[];
    /** resources/maps/*.json */
    maps: string[];
    /** resources/tiles/*.png */
    tilesets: string[];
    hmr: {
        host: string;
        port: number;
    };
}
export interface BridgeWriteResult {
    ok: boolean;
    path: string;
    bytes: number;
}
export interface BridgeReloadResult {
    ok: boolean;
    files: number;
    reply: string;
    host: string;
    port: number;
}
export type BridgeChangeOrigin = "bridge" | "external";
export interface BridgeChangeEvent {
    type: "change";
    path: string;
    event: string;
    origin: BridgeChangeOrigin;
    at: number;
}
export interface BridgeHelloEvent {
    type: "hello";
    project: string;
    version: string;
}
export type BridgeMessage = BridgeChangeEvent | BridgeHelloEvent;
export type BridgeWatchStatus = "connecting" | "open" | "closed";
export declare class BridgeError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
export declare class BridgeClient {
    private readonly baseUrl;
    constructor(baseUrl?: string);
    /** localStorage 로 덮어쓸 수 있는 기본 주소 */
    static defaultUrl(): string;
    get url(): string;
    /** `<img src>` 등에 바로 쓸 수 있는 파일 URL */
    fileUrl(path: string): string;
    health(): Promise<BridgeHealth>;
    project(): Promise<BridgeProjectInfo>;
    readText(path: string): Promise<string>;
    readBinary(path: string): Promise<ArrayBuffer>;
    readJson<T = unknown>(path: string): Promise<T>;
    writeText(path: string, content: string): Promise<BridgeWriteResult>;
    writeJson(path: string, value: unknown, pretty?: boolean): Promise<BridgeWriteResult>;
    remove(path: string): Promise<{
        ok: boolean;
        path: string;
    }>;
    /** scripts/**\/*.lua 를 실행 중인 게임으로 push (풀 리스타트) */
    reload(target?: {
        host?: string;
        port?: number;
    }): Promise<BridgeReloadResult>;
    /**
     * 파일 변경 알림 구독. 연결이 끊기면 자동으로 재접속한다.
     * 반환된 함수를 호출하면 구독을 해제한다.
     */
    watch(onMessage: (message: BridgeMessage) => void, onStatus?: (status: BridgeWatchStatus) => void): () => void;
    private json;
    private request;
}
/** 앱 전체가 공유하는 브리지 클라이언트 (주소는 최초 호출 시점의 설정을 따른다) */
export declare function getBridgeClient(): BridgeClient;
/** 주소를 바꾸고 공유 클라이언트를 재생성한다 (설정 화면 등에서 사용) */
export declare function setBridgeUrl(url: string): BridgeClient;
