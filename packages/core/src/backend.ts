// ProjectBackend: 로컬 파일을 다루는 하나의 창구 (docs/plans/03-project-and-runtime.md 2절).
//
// UI 는 이 인터페이스만 본다. 구현은 둘이다.
//   - @initial-editor/backend-tauri  : 데스크톱. Rust 명령(src-tauri/)을 invoke 로 부른다
//   - @initial-editor/backend-bridge : 브라우저. 엔진 저장소의 tools/bridge/server.js 를 HTTP 와 WebSocket 으로 부른다
//
// 경로 규칙: 모든 `rel` 은 프로젝트 루트 기준 상대 경로이고 구분자는 `/` 다 (paths.ts 의 normalizeRel 이
// 정규화한다). 루트 밖은 없다. 백엔드는 정규화된 경로만 받는다고 가정하지 말고 스스로 다시 검사한다.

export type BackendKind = "tauri" | "bridge";

export interface ProjectInfo {
  /** Tauri 는 절대 경로, 브리지는 서버가 알려 준 루트 (표시용) */
  root: string;
  /** 폴더 이름 (표시용) */
  name: string;
  /** 루트에 game.json 이 있는가. 없으면 UI 가 만들 것인지 묻는다 */
  hasGameJson: boolean;
}

export type EntryKind = "file" | "dir";

export interface Entry {
  /** 이름만 (경로 아님) */
  name: string;
  /** 루트 기준 상대 경로 */
  path: string;
  kind: EntryKind;
  /** 파일이면 바이트 수 */
  size?: number;
  /** 마지막 수정 시각 (epoch ms), 모르면 생략 */
  mtime?: number;
}

export type ChangeKind = "create" | "modify" | "delete";

export interface ChangeEvent {
  path: string;
  kind: ChangeKind;
  /** self: 이 에디터가 쓴 것, external: 밖에서 바뀐 것. 모르면 external */
  origin: "self" | "external";
}

export interface HmrFile {
  path: string;
  data: Uint8Array;
}

export interface HmrTarget {
  host: string;
  port: number;
}

export interface RunSpec {
  /** 엔진 실행 파일의 절대 경로 */
  exe: string;
  /** 작업 폴더 (프로젝트 루트). 엔진은 ./game.json 과 ./scripts 를 여기서 찾는다 */
  cwd: string;
  args?: string[];
  env?: Record<string, string>;
}

export type OutputStream = "stdout" | "stderr";

export interface RunHandle {
  id: number;
  pid?: number;
  onOutput(cb: (line: string, stream: OutputStream) => void): () => void;
  onExit(cb: (code: number | null) => void): () => void;
  /** 정지. 이미 끝났으면 아무것도 하지 않는다 */
  stop(): Promise<void>;
}

export interface BackendCapabilities {
  /** 엔진 프로세스를 띄울 수 있는가 (브리지 모드는 false) */
  run: boolean;
  /** OS 폴더 선택 대화상자가 있는가 (브리지 모드는 false, 경로 입력으로 대체) */
  pickFolder: boolean;
  /** 외부 변경 알림이 오는가 */
  watch: boolean;
}

export type BackendErrorCode =
  | "not_found"
  | "outside_root"
  | "not_open"
  | "io"
  | "unsupported"
  | "hmr_unreachable"
  | "engine_not_found"
  | "network";

export class BackendError extends Error {
  constructor(
    message: string,
    public readonly code: BackendErrorCode,
    public readonly path?: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export interface ProjectBackend {
  readonly kind: BackendKind;
  readonly capabilities: BackendCapabilities;

  /**
   * 프로젝트를 연다. Tauri 는 폴더의 절대 경로, 브리지는 서버 URL 을 받는다.
   * 그 뒤의 모든 상대 경로는 이 루트 기준이다.
   */
  open(root: string): Promise<ProjectInfo>;

  /** 폴더 한 층. 정렬은 호출자가 한다 (폴더 먼저, 이름순). "" 이 루트 */
  list(rel: string): Promise<Entry[]>;
  readText(rel: string): Promise<string>;
  readBinary(rel: string): Promise<Uint8Array>;
  /** 상위 폴더를 만들고 원자적으로 쓴다 (임시 파일 뒤 rename) */
  writeText(rel: string, text: string): Promise<void>;
  writeBinary(rel: string, data: Uint8Array): Promise<void>;
  mkdir(rel: string): Promise<void>;
  /** 파일과 빈 폴더. 폴더 안이 차 있으면 통째로 지운다 (UI 가 먼저 묻는다) */
  remove(rel: string): Promise<void>;
  rename(fromRel: string, toRel: string): Promise<void>;
  exists(rel: string): Promise<boolean>;

  /** 변경 알림 구독. 돌려주는 함수로 해지한다 */
  watch(handler: (e: ChangeEvent) => void): () => void;

  /**
   * 구독이 실제로 알림을 받기 시작하면 풀리는 약속 (선택). 브리지는 WebSocket 이 열리고 서버의 hello 를
   * 받은 뒤에야 알림이 온다. 그 전의 변경은 놓칠 수 있으므로, 순서가 중요한 곳(테스트)은 이것을 기다린다.
   * 구현하지 않은 백엔드는 구독과 동시에 알림을 받는 것으로 본다.
   */
  whenWatching?(timeoutMs?: number): Promise<void>;

  /** 스크립트 묶음을 엔진 핫 리로드 서버(기본 127.0.0.1:5959)로 보낸다 */
  hmrPush(files: HmrFile[], target?: HmrTarget): Promise<{ count: number }>;

  /** 엔진 프로세스. capabilities.run 이 false 면 BackendError("unsupported") */
  run(spec: RunSpec): Promise<RunHandle>;

  /** OS 폴더 선택. 취소면 null. capabilities.pickFolder 가 false 면 BackendError("unsupported") */
  pickFolder(): Promise<string | null>;

  /** 감시와 소켓을 정리한다 */
  close(): Promise<void>;
}

export const DEFAULT_HMR_TARGET: HmrTarget = { host: "127.0.0.1", port: 5959 };

/** 폴더 먼저, 그다음 이름순 (대소문자 무시). 모든 패널이 같은 순서를 보게 한다 */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
}
