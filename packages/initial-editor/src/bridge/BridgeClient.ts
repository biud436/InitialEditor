/**
 * Initial2D 브리지 서버 클라이언트.
 *
 * 브리지 서버(Initial2D 저장소의 tools/bridge/server.js, 기본 127.0.0.1:5960)는 게임 프로젝트의
 * scripts/ 와 resources/ 를 HTTP 로 읽고 쓰게 하고, 저장한 스크립트를 실행 중인 게임에 push(HMR)한다.
 * 이 클래스는 그 API 를 감싼 얇은 래퍼다. 서버 주소는 localStorage 의 `initial-editor.bridge-url`
 * 로 바꿀 수 있다.
 */

export const BRIDGE_URL_STORAGE_KEY = "initial-editor.bridge-url";
export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:5960";

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
    hmr: { host: string; port: number };
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

export class BridgeError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "BridgeError";
    }
}

export class BridgeClient {
    private readonly baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = (baseUrl || BridgeClient.defaultUrl()).replace(/\/+$/, "");
    }

    /** localStorage 로 덮어쓸 수 있는 기본 주소 */
    public static defaultUrl(): string {
        try {
            if (typeof localStorage !== "undefined") {
                const stored = localStorage.getItem(BRIDGE_URL_STORAGE_KEY);
                if (stored) {
                    return stored;
                }
            }
        } catch {
            /* localStorage 접근 불가 (프라이빗 모드 등) */
        }
        return DEFAULT_BRIDGE_URL;
    }

    public get url(): string {
        return this.baseUrl;
    }

    /** `<img src>` 등에 바로 쓸 수 있는 파일 URL */
    public fileUrl(path: string): string {
        return `${this.baseUrl}/api/files/${encodePath(path)}`;
    }

    public async health(): Promise<BridgeHealth> {
        return this.json<BridgeHealth>("GET", "/api/health");
    }

    public async project(): Promise<BridgeProjectInfo> {
        return this.json<BridgeProjectInfo>("GET", "/api/project");
    }

    public async readText(path: string): Promise<string> {
        const res = await this.request("GET", `/api/files/${encodePath(path)}`);
        return res.text();
    }

    public async readBinary(path: string): Promise<ArrayBuffer> {
        const res = await this.request("GET", `/api/files/${encodePath(path)}`);
        return res.arrayBuffer();
    }

    public async readJson<T = unknown>(path: string): Promise<T> {
        const text = await this.readText(path);
        return JSON.parse(text) as T;
    }

    public async writeText(path: string, content: string): Promise<BridgeWriteResult> {
        return this.json<BridgeWriteResult>("PUT", `/api/files/${encodePath(path)}`, {
            body: content,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }

    public async writeBinary(path: string, data: ArrayBuffer | Blob | Uint8Array): Promise<BridgeWriteResult> {
        return this.json<BridgeWriteResult>("PUT", `/api/files/${encodePath(path)}`, {
            body: data as BodyInit,
            headers: { "Content-Type": "application/octet-stream" },
        });
    }

    /**
     * 파일 존재 여부. HEAD 를 먼저 쓰고, HEAD 를 모르는 옛 브리지(405)면 GET 으로 확인한다
     * (두 저장소가 따로 배포되므로 버전이 어긋날 수 있다).
     */
    public async exists(path: string): Promise<boolean> {
        const url = `${this.baseUrl}/api/files/${encodePath(path)}`;
        let res: Response;
        try {
            res = await fetch(url, { method: "HEAD" });
            if (res.status === 405 || res.status === 501) {
                res = await fetch(url, { method: "GET" });
            }
        } catch {
            throw new BridgeError(0, `브리지 서버(${this.baseUrl})에 연결할 수 없습니다.`);
        }
        if (res.status === 404) return false;
        if (!res.ok) throw new BridgeError(res.status, `${res.status} ${res.statusText}`);
        return true;
    }

    public async writeJson(path: string, value: unknown, pretty = true): Promise<BridgeWriteResult> {
        const text = pretty ? JSON.stringify(value, null, 2) + "\n" : JSON.stringify(value);
        return this.json<BridgeWriteResult>("PUT", `/api/files/${encodePath(path)}`, {
            body: text,
            headers: { "Content-Type": "application/json; charset=utf-8" },
        });
    }

    public async remove(path: string): Promise<{ ok: boolean; path: string }> {
        return this.json("DELETE", `/api/files/${encodePath(path)}`);
    }

    /** scripts/**\/*.lua 를 실행 중인 게임으로 push (풀 리스타트) */
    public async reload(target?: { host?: string; port?: number }): Promise<BridgeReloadResult> {
        return this.json<BridgeReloadResult>("POST", "/api/reload", {
            body: JSON.stringify(target || {}),
            headers: { "Content-Type": "application/json" },
        });
    }

    /**
     * 파일 변경 알림 구독. 연결이 끊기면 자동으로 재접속한다.
     * 반환된 함수를 호출하면 구독을 해제한다.
     */
    public watch(
        onMessage: (message: BridgeMessage) => void,
        onStatus?: (status: BridgeWatchStatus) => void,
    ): () => void {
        const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
        let socket: WebSocket | null = null;
        let stopped = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryDelay = 1000;

        const connect = () => {
            if (stopped) return;
            onStatus?.("connecting");
            try {
                socket = new WebSocket(wsUrl);
            } catch {
                scheduleRetry();
                return;
            }
            socket.onopen = () => {
                retryDelay = 1000;
                onStatus?.("open");
            };
            socket.onmessage = (ev) => {
                try {
                    onMessage(JSON.parse(String(ev.data)) as BridgeMessage);
                } catch {
                    /* 형식이 맞지 않는 메시지는 무시 */
                }
            };
            socket.onclose = () => {
                socket = null;
                onStatus?.("closed");
                scheduleRetry();
            };
            socket.onerror = () => {
                /* onclose 가 뒤따른다 */
            };
        };
        const scheduleRetry = () => {
            if (stopped) return;
            retryTimer = setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 10000);
        };
        connect();

        return () => {
            stopped = true;
            if (retryTimer) clearTimeout(retryTimer);
            if (socket) {
                socket.onclose = null;
                socket.close();
            }
        };
    }

    private async json<T>(method: string, route: string, init?: RequestInit): Promise<T> {
        const res = await this.request(method, route, init);
        return (await res.json()) as T;
    }

    private async request(method: string, route: string, init?: RequestInit): Promise<Response> {
        let res: Response;
        try {
            res = await fetch(this.baseUrl + route, { ...init, method });
        } catch (e) {
            throw new BridgeError(
                0,
                `브리지 서버(${this.baseUrl})에 연결할 수 없습니다. Initial2D 저장소에서 ` +
                    `\`node tools/bridge/server.js\` 를 실행했는지 확인하세요.`,
            );
        }
        if (!res.ok) {
            let detail = `${res.status} ${res.statusText}`;
            try {
                const body = (await res.json()) as { error?: string };
                if (body && body.error) detail = body.error;
            } catch {
                /* JSON 아님 */
            }
            throw new BridgeError(res.status, detail);
        }
        return res;
    }
}

function encodePath(path: string): string {
    return path
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
}

let sharedClient: BridgeClient | null = null;

/** 앱 전체가 공유하는 브리지 클라이언트 (주소는 최초 호출 시점의 설정을 따른다) */
export function getBridgeClient(): BridgeClient {
    if (!sharedClient) {
        sharedClient = new BridgeClient();
    }
    return sharedClient;
}

/** 주소를 바꾸고 공유 클라이언트를 재생성한다 (설정 화면 등에서 사용) */
export function setBridgeUrl(url: string): BridgeClient {
    try {
        localStorage.setItem(BRIDGE_URL_STORAGE_KEY, url);
    } catch {
        /* ignore */
    }
    sharedClient = new BridgeClient(url);
    return sharedClient;
}
