// ProjectBackend 의 Tauri 구현. 전부 src-tauri 의 명령을 invoke 로 부르는 얇은 래퍼다 (docs/plans/01-tech-stack.md 6절).
//
// IPC 계약 (src-tauri/src/commands.rs 와 같아야 한다)
//   명령: project_open(path) → ProjectInfo, project_close()
//         fs_list(rel) → Entry[], fs_read_text(rel) → string, fs_read_binary(rel) → ArrayBuffer
//         fs_write_text(rel, text), fs_write_binary(raw body, 헤더 x-rel), fs_mkdir(rel), fs_remove(rel)
//         fs_rename(from, to), fs_exists(rel) → boolean
//         hmr_push(host, port, files[{ path, data: base64 }]) → { count }
//         engine_run(exe, cwd, args, env) → { id, pid }, engine_stop(id), engine_features(exe) → string[]
//         settings_load() → string | null, settings_save(json)
//   이벤트: fs:change { path, kind, origin }, engine:output { id, stream, line }, engine:exit { id, code }
//   오류: { code, message, path? } (code 는 BackendErrorCode) 를 받아 core 의 BackendError 로 되만든다
//
// 바이너리 전달
//   읽기: Rust 가 tauri::ipc::Response 로 바이트를 그대로 주고 여기서 ArrayBuffer 를 Uint8Array 로 감싼다
//   쓰기: invoke 의 두 번째 인자로 Uint8Array 를 주면 JSON 이 아니라 raw body 로 간다. 상대 경로는
//         `x-rel` 헤더에 percent 인코딩(encodeURIComponent)해 싣는다 (헤더 값은 ASCII 만 된다)
//   hmr_push: 파일 여러 개를 JSON 하나로 보내야 해서 data 를 base64 문자열로 (숫자 배열은 네 배로 커진다)

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  BackendError,
  DEFAULT_HMR_TARGET,
  type BackendCapabilities,
  type BackendErrorCode,
  type ChangeEvent,
  type EditorSettings,
  type Entry,
  type HmrFile,
  type HmrTarget,
  type OutputStream,
  type ProjectBackend,
  type ProjectInfo,
  type RunHandle,
  type RunSpec,
  type SettingsStorage,
} from "@initial-editor/core";

/** Tauri 웹뷰 안에서 도는가 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const EVENT_FS_CHANGE = "fs:change";
export const EVENT_ENGINE_OUTPUT = "engine:output";
export const EVENT_ENGINE_EXIT = "engine:exit";

const ERROR_CODES: ReadonlySet<string> = new Set<BackendErrorCode>([
  "not_found",
  "outside_root",
  "not_open",
  "io",
  "unsupported",
  "hmr_unreachable",
  "engine_not_found",
  "network",
]);

interface WireError {
  code?: unknown;
  message?: unknown;
  path?: unknown;
}

/** Rust 의 BackendError 직렬화 결과(또는 아무 오류)를 core 의 BackendError 로 */
export function toBackendError(err: unknown): BackendError {
  if (err instanceof BackendError) return err;
  if (err && typeof err === "object" && typeof (err as WireError).code === "string") {
    const wire = err as WireError;
    const rawCode = wire.code as string;
    const code = (ERROR_CODES.has(rawCode) ? rawCode : "io") as BackendErrorCode;
    const message = typeof wire.message === "string" ? wire.message : rawCode;
    const path = typeof wire.path === "string" ? wire.path : undefined;
    return new BackendError(message, code, path);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new BackendError(message, "io");
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toBackendError(e);
  }
}

/** Uint8Array → base64 (큰 배열도 스택을 넘기지 않게 잘라서) */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}

/** raw body 는 버퍼 전체가 가므로, 큰 버퍼의 일부만 가리키는 뷰는 복사한다 */
function wholeBuffer(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
}

interface OutputPayload {
  id: number;
  stream: OutputStream;
  line: string;
}

interface ExitPayload {
  id: number;
  code: number | null;
}

interface RunInfo {
  id: number;
  pid: number;
}

const OUTPUT_BUFFER_LIMIT = 2000;

/**
 * 엔진 프로세스 하나. 이벤트 구독을 프로세스를 띄우기 전에 마쳐 두고, id 를 알기 전이나 구독자가 붙기 전에
 * 온 줄과 종료는 잠시 쌓아 두었다가 넘긴다 (바로 죽는 엔진의 종료 코드도 놓치지 않게).
 */
class TauriRunHandle implements RunHandle {
  id = 0;
  pid?: number;
  private readonly outputCallbacks = new Set<(line: string, stream: OutputStream) => void>();
  private readonly exitCallbacks = new Set<(code: number | null) => void>();
  /** id 를 알기 전에 온 이벤트 (다른 프로세스 것일 수 있어 나중에 거른다) */
  private early: Array<OutputPayload | ExitPayload> | null = [];
  /** 첫 onOutput 구독자가 붙기 전의 줄 */
  private buffered: Array<[string, OutputStream]> | null = [];
  private exit: ExitPayload | null = null;
  private unlisteners: UnlistenFn[] = [];

  static async start(spec: RunSpec): Promise<TauriRunHandle> {
    const handle = new TauriRunHandle();
    handle.unlisteners = await Promise.all([
      listen<OutputPayload>(EVENT_ENGINE_OUTPUT, (ev) => handle.onEvent(ev.payload)),
      listen<ExitPayload>(EVENT_ENGINE_EXIT, (ev) => handle.onEvent(ev.payload)),
    ]);
    try {
      const info = await call<RunInfo>("engine_run", {
        exe: spec.exe,
        cwd: spec.cwd,
        args: spec.args ?? [],
        env: spec.env ?? {},
      });
      handle.id = info.id;
      handle.pid = info.pid;
    } catch (e) {
      handle.dispose();
      throw e;
    }
    const early = handle.early ?? [];
    handle.early = null;
    for (const payload of early) handle.onEvent(payload);
    return handle;
  }

  private onEvent(payload: OutputPayload | ExitPayload): void {
    if (this.early) {
      this.early.push(payload);
      return;
    }
    if (payload.id !== this.id || this.exit) return;
    if ("line" in payload) {
      if (this.buffered) {
        if (this.buffered.length < OUTPUT_BUFFER_LIMIT) this.buffered.push([payload.line, payload.stream]);
        return;
      }
      for (const cb of this.outputCallbacks) cb(payload.line, payload.stream);
      return;
    }
    this.exit = payload;
    for (const cb of this.exitCallbacks) cb(payload.code);
    this.dispose();
  }

  onOutput(cb: (line: string, stream: OutputStream) => void): () => void {
    this.outputCallbacks.add(cb);
    if (this.buffered) {
      const lines = this.buffered;
      this.buffered = null;
      for (const [line, stream] of lines) cb(line, stream);
    }
    return () => {
      this.outputCallbacks.delete(cb);
    };
  }

  onExit(cb: (code: number | null) => void): () => void {
    this.exitCallbacks.add(cb);
    if (this.exit) cb(this.exit.code);
    return () => {
      this.exitCallbacks.delete(cb);
    };
  }

  async stop(): Promise<void> {
    if (this.exit || this.id === 0) return;
    await call<void>("engine_stop", { id: this.id });
  }

  private dispose(): void {
    for (const off of this.unlisteners) off();
    this.unlisteners = [];
  }
}

export class TauriBackend implements ProjectBackend {
  readonly kind = "tauri" as const;
  readonly capabilities: BackendCapabilities = { run: true, pickFolder: true, watch: true };

  private readonly changeHandlers = new Set<(e: ChangeEvent) => void>();
  private changeListener: Promise<UnlistenFn> | null = null;

  /** 폴더의 절대 경로를 받는다. Rust 가 루트를 기억하고 감시를 켠다 */
  open(root: string): Promise<ProjectInfo> {
    return call<ProjectInfo>("project_open", { path: root });
  }

  list(rel: string): Promise<Entry[]> {
    return call<Entry[]>("fs_list", { rel });
  }

  readText(rel: string): Promise<string> {
    return call<string>("fs_read_text", { rel });
  }

  async readBinary(rel: string): Promise<Uint8Array> {
    const buffer = await call<ArrayBuffer>("fs_read_binary", { rel });
    return new Uint8Array(buffer);
  }

  writeText(rel: string, text: string): Promise<void> {
    return call<void>("fs_write_text", { rel, text });
  }

  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    try {
      await invoke<void>("fs_write_binary", wholeBuffer(data), { headers: { "x-rel": encodeURIComponent(rel) } });
    } catch (e) {
      throw toBackendError(e);
    }
  }

  mkdir(rel: string): Promise<void> {
    return call<void>("fs_mkdir", { rel });
  }

  remove(rel: string): Promise<void> {
    return call<void>("fs_remove", { rel });
  }

  rename(fromRel: string, toRel: string): Promise<void> {
    return call<void>("fs_rename", { from: fromRel, to: toRel });
  }

  exists(rel: string): Promise<boolean> {
    return call<boolean>("fs_exists", { rel });
  }

  /** fs:change 이벤트를 나눠 준다. 첫 구독자가 붙을 때 listen 하고 마지막이 떠날 때 푼다 */
  watch(handler: (e: ChangeEvent) => void): () => void {
    this.changeHandlers.add(handler);
    if (!this.changeListener) {
      this.changeListener = listen<ChangeEvent>(EVENT_FS_CHANGE, (ev) => {
        for (const h of this.changeHandlers) h(ev.payload);
      });
    }
    return () => {
      this.changeHandlers.delete(handler);
      if (this.changeHandlers.size === 0) void this.stopListening();
    };
  }

  private async stopListening(): Promise<void> {
    const pending = this.changeListener;
    this.changeListener = null;
    if (pending) {
      const off = await pending.catch(() => null);
      off?.();
    }
  }

  hmrPush(files: HmrFile[], target: HmrTarget = DEFAULT_HMR_TARGET): Promise<{ count: number }> {
    return call<{ count: number }>("hmr_push", {
      host: target.host,
      port: target.port,
      files: files.map((f) => ({ path: f.path, data: toBase64(f.data) })),
    });
  }

  async run(spec: RunSpec): Promise<RunHandle> {
    try {
      return await TauriRunHandle.start(spec);
    } catch (e) {
      throw toBackendError(e);
    }
  }

  async pickFolder(): Promise<string | null> {
    try {
      const picked = await openDialog({ directory: true, multiple: false, title: "프로젝트 폴더 선택" });
      return picked ?? null;
    } catch (e) {
      throw toBackendError(e);
    }
  }

  /** 감시 구독을 풀고 Rust 쪽 루트를 잊는다. 그 뒤의 파일 명령은 not_open 이다 */
  async close(): Promise<void> {
    this.changeHandlers.clear();
    await this.stopListening();
    await call<void>("project_close");
  }
}

/** 앱 설정 폴더의 settings.json. 내용 해석은 core 의 SettingsStore 가 한다 */
export class TauriSettingsStorage implements SettingsStorage {
  async load(): Promise<Partial<EditorSettings> | null> {
    const json = await call<string | null>("settings_load");
    if (!json) return null;
    try {
      const parsed: unknown = JSON.parse(json);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Partial<EditorSettings>) : null;
    } catch {
      return null;
    }
  }

  async save(settings: EditorSettings): Promise<void> {
    await call<void>("settings_save", { json: JSON.stringify(settings, null, 2) });
  }
}

/** `exe --features` 의 단어들 ("lua" 또는 "lua mruby"). E1 이 언어 토글을 잠그는 데 쓴다 */
export function engineFeatures(exe: string): Promise<string[]> {
  return call<string[]>("engine_features", { exe });
}

/** 시작할 때 열 프로젝트 (환경 변수 INITIAL_EDITOR_OPEN 또는 `--open <경로>`). 없으면 null */
export function startupOpenPath(): Promise<string | null> {
  return call<string | null>("startup_open_path");
}
