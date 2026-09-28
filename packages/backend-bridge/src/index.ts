// ProjectBackend 의 브리지 구현 (docs/plans/03-project-and-runtime.md 2절).
//
// 상대는 엔진 저장소의 tools/bridge/server.js (0.2.0 이상, 기본 127.0.0.1:5960)다. 서버가 프로젝트
// 하나를 서빙하므로 open() 에 넘기는 값은 폴더가 아니라 서버 URL 이다. 파일 API 는 HTTP, 변경 알림은
// WebSocket /ws 다.
//
// 브라우저 모드는 개발과 UI 테스트용이라 엔진 실행(run)과 폴더 선택(pickFolder)은 없다.

import {
  BackendError,
  DEFAULT_HMR_TARGET,
  normalizeRel,
  PathError,
  type BackendCapabilities,
  type BackendErrorCode,
  type ChangeEvent,
  type Entry,
  type HmrFile,
  type HmrTarget,
  type ProjectBackend,
  type ProjectInfo,
  type RunHandle,
  type RunSpec,
} from "@initial-editor/core";

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:5960";

/** 서버의 /api/project 응답 (필요한 것만) */
export interface BridgeProjectInfo {
  name: string;
  root: string;
  bridgeVersion: string;
  allowedDirs: string[];
  allowedFiles?: string[];
  hasGameJson?: boolean;
  scripts: string[];
  maps: string[];
  tilesets: string[];
  hmr: { host: string; port: number };
}

interface BridgeDirEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
  mtime?: number;
}

interface BridgeChangeMessage {
  type: "change";
  path: string;
  event: string;
  kind?: "create" | "modify" | "delete";
  origin: "bridge" | "external";
  at: number;
}

export type BridgeWatchStatus = "connecting" | "open" | "closed";

function codeForStatus(status: number): BackendErrorCode {
  switch (status) {
    case 404:
      return "not_found";
    case 400:
    case 403:
      return "outside_root";
    case 502:
      return "hmr_unreachable";
    default:
      return "io";
  }
}

function encodePath(rel: string): string {
  return rel
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export class BridgeBackend implements ProjectBackend {
  readonly kind = "bridge" as const;
  readonly capabilities: BackendCapabilities = { run: false, pickFolder: false, watch: true, hmr: true };

  private baseUrl: string;
  private opened = false;
  private info: BridgeProjectInfo | null = null;
  private readonly watchers = new Set<(e: ChangeEvent) => void>();
  private socketStop: (() => void) | null = null;
  /** 서버의 hello 를 받아 알림이 오기 시작했다 */
  private socketReady = false;
  private readyWaiters: Array<() => void> = [];
  private statusListener: ((s: BridgeWatchStatus) => void) | null = null;

  constructor(baseUrl: string = DEFAULT_BRIDGE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  get url(): string {
    return this.baseUrl;
  }

  /** `<img src>` 에 바로 쓸 수 있는 파일 URL */
  fileUrl(rel: string): string {
    return `${this.baseUrl}/api/files/${encodePath(this.rel(rel))}`;
  }

  /** 서버 상태 (설정 화면과 상태 바용) */
  onWatchStatus(listener: ((s: BridgeWatchStatus) => void) | null): void {
    this.statusListener = listener;
  }

  get projectInfo(): BridgeProjectInfo | null {
    return this.info;
  }

  async open(root: string): Promise<ProjectInfo> {
    if (root && root.trim() !== "") this.baseUrl = root.trim().replace(/\/+$/, "");
    const info = await this.json<BridgeProjectInfo>("GET", "/api/project");
    this.info = info;
    this.opened = true;
    if (this.watchers.size > 0) this.ensureSocket();
    return { root: info.root, name: info.name, hasGameJson: info.hasGameJson ?? false };
  }

  async list(rel: string): Promise<Entry[]> {
    const r = this.rel(rel);
    const body = await this.json<{ entries: BridgeDirEntry[] }>("GET", r === "" ? "/api/dir" : `/api/dir/${encodePath(r)}`);
    return body.entries.map((e) => ({ name: e.name, path: e.path, kind: e.kind, size: e.size, mtime: e.mtime }));
  }

  async readText(rel: string): Promise<string> {
    const res = await this.request("GET", `/api/files/${encodePath(this.rel(rel))}`);
    return res.text();
  }

  async readBinary(rel: string): Promise<Uint8Array> {
    const res = await this.request("GET", `/api/files/${encodePath(this.rel(rel))}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async writeText(rel: string, text: string): Promise<void> {
    await this.request("PUT", `/api/files/${encodePath(this.rel(rel))}`, {
      body: text,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    // Uint8Array 의 뷰가 아니라 그 바이트만 보낸다 (버퍼가 더 클 수 있다)
    const body = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data : data.slice();
    await this.request("PUT", `/api/files/${encodePath(this.rel(rel))}`, {
      body: body as unknown as BodyInit,
      headers: { "Content-Type": "application/octet-stream" },
    });
  }

  async mkdir(rel: string): Promise<void> {
    const r = this.rel(rel);
    if (r === "") return;
    await this.request("POST", `/api/mkdir/${encodePath(r)}`);
  }

  async remove(rel: string): Promise<void> {
    const r = this.rel(rel);
    if (r === "") throw new BackendError("프로젝트 루트 삭제 불가", "outside_root", rel);
    await this.request("DELETE", `/api/files/${encodePath(r)}`);
  }

  async rename(fromRel: string, toRel: string): Promise<void> {
    await this.request("POST", "/api/rename", {
      body: JSON.stringify({ from: this.rel(fromRel), to: this.rel(toRel) }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async exists(rel: string): Promise<boolean> {
    const r = this.rel(rel);
    if (r === "") return true;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/stat/${encodePath(r)}`);
    } catch {
      throw this.unreachable();
    }
    if (res.status === 404) return false;
    if (!res.ok) throw await this.errorFrom(res, r);
    return true;
  }

  whenWatching(timeoutMs = 5000): Promise<void> {
    if (typeof WebSocket === "undefined") {
      return Promise.reject(new BackendError("이 실행 환경은 WebSocket 미지원이라 변경 알림 수신 불가 (브라우저나 Node 22 이상 필요)", "unsupported"));
    }
    if (this.socketReady || this.watchers.size === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== done);
        reject(new BackendError(`브리지 알림 연결 시간 초과 (${timeoutMs}ms)`, "network"));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      this.readyWaiters.push(done);
    });
  }

  watch(handler: (e: ChangeEvent) => void): () => void {
    this.watchers.add(handler);
    this.ensureSocket();
    return () => {
      this.watchers.delete(handler);
      if (this.watchers.size === 0) this.stopSocket();
    };
  }

  /**
   * 서버가 scripts/ 아래의 *.lua 와 *.rb 를 디스크에서 모아 push 한다. 그래서 files 는 개수 확인에만 쓴다
   * (저장은 이미 끝났으므로 디스크가 진실이다). 상대가 없으면 hmr_unreachable.
   */
  async hmrPush(_files: HmrFile[], target: HmrTarget = DEFAULT_HMR_TARGET): Promise<{ count: number }> {
    this.assertOpen();
    const body = await this.json<{ files: number }>("POST", "/api/reload", {
      body: JSON.stringify({ host: target.host, port: target.port }),
      headers: { "Content-Type": "application/json" },
    });
    return { count: body.files };
  }

  async run(_spec: RunSpec): Promise<RunHandle> {
    throw new BackendError("브라우저 모드는 엔진 프로세스 실행 미지원. 데스크톱 앱이나 터미널에서 실행", "unsupported");
  }

  async pickFolder(): Promise<string | null> {
    throw new BackendError("브라우저 모드는 폴더 선택 미지원. 브리지 서버가 서빙하는 프로젝트만 사용 가능", "unsupported");
  }

  async close(): Promise<void> {
    this.stopSocket();
    this.watchers.clear();
    this.opened = false;
    this.info = null;
  }

  // ---- 내부 ----

  private assertOpen(): void {
    if (!this.opened) throw new BackendError("열린 프로젝트 없음", "not_open");
  }

  private rel(input: string): string {
    this.assertOpen();
    try {
      return normalizeRel(input);
    } catch (e) {
      if (e instanceof PathError) throw new BackendError(e.message, "outside_root", input);
      throw e;
    }
  }

  private unreachable(): BackendError {
    return new BackendError(
      `브리지 서버(${this.baseUrl}) 연결 실패. Initial2D 저장소에서 node tools/bridge/server.js 실행 여부 확인`,
      "network",
    );
  }

  private async errorFrom(res: Response, rel?: string): Promise<BackendError> {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body && body.error) detail = body.error;
    } catch {
      /* JSON 아님 */
    }
    return new BackendError(detail, codeForStatus(res.status), rel);
  }

  private async json<T>(method: string, route: string, init?: RequestInit): Promise<T> {
    const res = await this.request(method, route, init);
    return (await res.json()) as T;
  }

  private async request(method: string, route: string, init?: RequestInit): Promise<Response> {
    if (route !== "/api/project" && route !== "/api/health") this.assertOpen();
    let res: Response;
    try {
      res = await fetch(this.baseUrl + route, { ...init, method });
    } catch {
      throw this.unreachable();
    }
    if (!res.ok) throw await this.errorFrom(res, decodeRoute(route));
    return res;
  }

  private ensureSocket(): void {
    if (this.socketStop) return;
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
    let socket: WebSocket | null = null;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    const connect = () => {
      if (stopped) return;
      this.statusListener?.("connecting");
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        scheduleRetry();
        return;
      }
      socket.onopen = () => {
        retryDelay = 1000;
        this.statusListener?.("open");
      };
      socket.onmessage = (ev) => {
        let message: BridgeChangeMessage | { type: string };
        try {
          message = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (message.type === "hello") {
          this.socketReady = true;
          const waiters = this.readyWaiters;
          this.readyWaiters = [];
          for (const w of waiters) w();
          return;
        }
        if (message.type !== "change") return;
        const change = message as BridgeChangeMessage;
        const event: ChangeEvent = {
          path: change.path,
          kind: change.kind ?? (change.event === "rename" ? "create" : "modify"),
          origin: change.origin === "bridge" ? "self" : "external",
        };
        for (const handler of [...this.watchers]) handler(event);
      };
      socket.onclose = () => {
        socket = null;
        this.socketReady = false;
        this.statusListener?.("closed");
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

    this.socketStop = () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }

  private stopSocket(): void {
    this.socketStop?.();
    this.socketStop = null;
    this.socketReady = false;
  }
}

function decodeRoute(route: string): string | undefined {
  const m = route.match(/^\/api\/(?:files|dir|stat|mkdir)\/(.*)$/);
  return m ? decodeURIComponent(m[1]) : undefined;
}
