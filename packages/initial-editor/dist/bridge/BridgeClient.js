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
export class BridgeError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "BridgeError";
    }
}
export class BridgeClient {
    constructor(baseUrl) {
        this.baseUrl = (baseUrl || BridgeClient.defaultUrl()).replace(/\/+$/, "");
    }
    /** localStorage 로 덮어쓸 수 있는 기본 주소 */
    static defaultUrl() {
        try {
            if (typeof localStorage !== "undefined") {
                const stored = localStorage.getItem(BRIDGE_URL_STORAGE_KEY);
                if (stored) {
                    return stored;
                }
            }
        }
        catch {
            /* localStorage 접근 불가 (프라이빗 모드 등) */
        }
        return DEFAULT_BRIDGE_URL;
    }
    get url() {
        return this.baseUrl;
    }
    /** `<img src>` 등에 바로 쓸 수 있는 파일 URL */
    fileUrl(path) {
        return `${this.baseUrl}/api/files/${encodePath(path)}`;
    }
    async health() {
        return this.json("GET", "/api/health");
    }
    async project() {
        return this.json("GET", "/api/project");
    }
    async readText(path) {
        const res = await this.request("GET", `/api/files/${encodePath(path)}`);
        return res.text();
    }
    async readBinary(path) {
        const res = await this.request("GET", `/api/files/${encodePath(path)}`);
        return res.arrayBuffer();
    }
    async readJson(path) {
        const text = await this.readText(path);
        return JSON.parse(text);
    }
    async writeText(path, content) {
        return this.json("PUT", `/api/files/${encodePath(path)}`, {
            body: content,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }
    async writeJson(path, value, pretty = true) {
        const text = pretty ? JSON.stringify(value, null, 2) + "\n" : JSON.stringify(value);
        return this.json("PUT", `/api/files/${encodePath(path)}`, {
            body: text,
            headers: { "Content-Type": "application/json; charset=utf-8" },
        });
    }
    async remove(path) {
        return this.json("DELETE", `/api/files/${encodePath(path)}`);
    }
    /** scripts/**\/*.lua 를 실행 중인 게임으로 push (풀 리스타트) */
    async reload(target) {
        return this.json("POST", "/api/reload", {
            body: JSON.stringify(target || {}),
            headers: { "Content-Type": "application/json" },
        });
    }
    /**
     * 파일 변경 알림 구독. 연결이 끊기면 자동으로 재접속한다.
     * 반환된 함수를 호출하면 구독을 해제한다.
     */
    watch(onMessage, onStatus) {
        const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
        let socket = null;
        let stopped = false;
        let retryTimer = null;
        let retryDelay = 1000;
        const connect = () => {
            if (stopped)
                return;
            onStatus?.("connecting");
            try {
                socket = new WebSocket(wsUrl);
            }
            catch {
                scheduleRetry();
                return;
            }
            socket.onopen = () => {
                retryDelay = 1000;
                onStatus?.("open");
            };
            socket.onmessage = (ev) => {
                try {
                    onMessage(JSON.parse(String(ev.data)));
                }
                catch {
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
            if (stopped)
                return;
            retryTimer = setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 10000);
        };
        connect();
        return () => {
            stopped = true;
            if (retryTimer)
                clearTimeout(retryTimer);
            if (socket) {
                socket.onclose = null;
                socket.close();
            }
        };
    }
    async json(method, route, init) {
        const res = await this.request(method, route, init);
        return (await res.json());
    }
    async request(method, route, init) {
        let res;
        try {
            res = await fetch(this.baseUrl + route, { ...init, method });
        }
        catch (e) {
            throw new BridgeError(0, `브리지 서버(${this.baseUrl})에 연결할 수 없습니다. Initial2D 저장소에서 ` +
                `\`node tools/bridge/server.js\` 를 실행했는지 확인하세요.`);
        }
        if (!res.ok) {
            let detail = `${res.status} ${res.statusText}`;
            try {
                const body = (await res.json());
                if (body && body.error)
                    detail = body.error;
            }
            catch {
                /* JSON 아님 */
            }
            throw new BridgeError(res.status, detail);
        }
        return res;
    }
}
function encodePath(path) {
    return path
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
}
let sharedClient = null;
/** 앱 전체가 공유하는 브리지 클라이언트 (주소는 최초 호출 시점의 설정을 따른다) */
export function getBridgeClient() {
    if (!sharedClient) {
        sharedClient = new BridgeClient();
    }
    return sharedClient;
}
/** 주소를 바꾸고 공유 클라이언트를 재생성한다 (설정 화면 등에서 사용) */
export function setBridgeUrl(url) {
    try {
        localStorage.setItem(BRIDGE_URL_STORAGE_KEY, url);
    }
    catch {
        /* ignore */
    }
    sharedClient = new BridgeClient(url);
    return sharedClient;
}
//# sourceMappingURL=BridgeClient.js.map