// ProjectBackend 의 브라우저 폴더 구현 (docs/plans/03-project-and-runtime.md 2절, e4-embedded-play.md 웹판).
//
// 크로미움의 폴더 열기(File System Access API)로 고른 폴더를 서버 없이 직접 읽고 쓴다. open() 의 root 는
//   - 기억한 폴더의 키: pickFolder() 가 폴더 핸들을 IndexedDB 에 넣고 돌려준 값 (handleStore.ts). open() 은 이
//     페이지에서 고르거나 다시 열기(handles.restore)로 꺼낸 핸들만 쓰고, IndexedDB 에서 핸들을 꺼내지 않는다
//   - "opfs" 또는 "opfs:<하위 폴더>": 브라우저 전용 저장소(Origin Private File System). 테스트와 연습용
// 엔진 프로세스와 핫 리로드 서버는 없다 (게임은 페이지 안의 WASM 엔진이 돌린다). 감시는 폴링이다 (poller.ts).

import {
  BackendError,
  basename,
  dirname,
  decodeUtf8,
  encodeUtf8,
  isInside,
  type BackendCapabilities,
  type ChangeEvent,
  type Entry,
  type HmrFile,
  type HmrTarget,
  type ProjectBackend,
  type ProjectInfo,
  type RunHandle,
  type RunSpec,
} from "@initial-editor/core";
import { cleanRel, errorName, toBackendError } from "./errors";
import { copyEntry, defaultOpfsRoot, defaultPicker, fileStamp, isMissing, joinRel, readEntries, requestReadWrite, writeFile } from "./fsOps";
import { createHandleStore, type HandleStore } from "./handleStore";
import { hashBytes } from "./hash";
import { ChangePoller, type PollSource, type StampedEntry } from "./poller";
import type { FsDirHandle, FsFileData, FsFileHandle, FsHandle } from "./types";

export const OPFS_ROOT = "opfs";
export const OPFS_NAME = "OPFS";

export interface FsAccessBackendOptions {
  /** 기억한 폴더 (기본 IndexedDB) */
  handles?: HandleStore;
  /** OPFS 루트 (기본 navigator.storage.getDirectory) */
  opfsRoot?: () => Promise<FsDirHandle>;
  /** 폴더 고르기 (기본 showDirectoryPicker). 취소면 null */
  picker?: () => Promise<FsDirHandle | null>;
  /** 폴링 간격 (기본 1500ms) */
  pollMs?: number;
  /** 이 백엔드가 쓴 것으로 볼 시간 (기본 3000ms) */
  selfWindowMs?: number;
  now?: () => number;
}

export class FsAccessBackend implements ProjectBackend {
  readonly kind = "browser" as const;
  readonly capabilities: BackendCapabilities = { run: false, pickFolder: true, watch: true, hmr: false };
  readonly handles: HandleStore;

  private rootHandle: FsDirHandle | null = null;
  private rootKey: string | null = null;
  private readonly watchers = new Set<(e: ChangeEvent) => void>();
  private readonly poller: ChangePoller;
  private readonly opfsRoot: () => Promise<FsDirHandle>;
  private readonly picker: () => Promise<FsDirHandle | null>;

  constructor(options: FsAccessBackendOptions = {}) {
    this.handles = options.handles ?? createHandleStore();
    this.opfsRoot = options.opfsRoot ?? defaultOpfsRoot;
    this.picker = options.picker ?? defaultPicker;
    const source: PollSource = {
      listDir: async (rel) => {
        const dir = await this.lookupDir(rel);
        return dir ? readEntries(dir) : null;
      },
      statFile: async (rel) => {
        const data = await this.lookupFileData(rel);
        return data ? fileStamp(data) : null;
      },
      hashFile: async (rel) => {
        const data = await this.lookupFileData(rel);
        return data ? hashBytes(new Uint8Array(await data.arrayBuffer())) : null;
      },
    };
    this.poller = new ChangePoller(source, (e) => this.dispatch(e), {
      intervalMs: options.pollMs,
      selfWindowMs: options.selfWindowMs,
      now: options.now,
    });
  }

  /** 열린 프로젝트의 키 (open 에 넘긴 값). 닫혀 있으면 null */
  get openedRoot(): string | null {
    return this.rootKey;
  }

  /** 기억한 폴더의 권한을 묻는다. 클릭 처리기 안에서 부른다 */
  async requestAccess(root: string): Promise<boolean> {
    const { handle } = await this.resolveRoot(root);
    return requestReadWrite(handle, true);
  }

  async open(root: string): Promise<ProjectInfo> {
    this.poller.stop();
    this.poller.reset();
    this.rootHandle = null;
    this.rootKey = null;
    const { handle, name, remembered } = await this.resolveRoot(root);
    if (!(await requestReadWrite(handle, true))) {
      throw new BackendError(`폴더 접근 권한이 없습니다: ${name}. 시작 화면에서 다시 열기를 클릭하면 권한을 요청합니다.`, "io");
    }
    let entries: StampedEntry[];
    try {
      entries = await readEntries(handle);
    } catch (e) {
      throw toBackendError(e, "");
    }
    this.rootHandle = handle;
    this.rootKey = root.trim();
    this.poller.trackDir("", entries);
    if (this.watchers.size > 0) this.poller.start();
    this.handles.markOpened();
    if (remembered) void this.handles.touch(this.rootKey).catch(() => {});
    const hasGameJson = entries.some((e) => e.name === "game.json" && e.stamp.kind === "file");
    return { root: name, name, hasGameJson };
  }

  async list(rel: string): Promise<Entry[]> {
    const p = this.rel(rel);
    const dir = await this.dirHandle(p);
    let entries: StampedEntry[];
    try {
      entries = await readEntries(dir);
    } catch (e) {
      throw toBackendError(e, p);
    }
    this.poller.trackDir(p, entries);
    return entries.map(({ name, stamp }) =>
      stamp.kind === "file"
        ? { name, path: joinRel(p, name), kind: "file", size: stamp.size, mtime: stamp.mtime }
        : { name, path: joinRel(p, name), kind: "dir" },
    );
  }

  async readText(rel: string): Promise<string> {
    return decodeUtf8(await this.readBinary(rel));
  }

  async readBinary(rel: string): Promise<Uint8Array> {
    const p = this.rel(rel);
    if (p === "") throw new BackendError("프로젝트 루트는 파일이 아님", "io", p);
    const handle = await this.fileHandle(p);
    try {
      const file = await handle.getFile();
      const data = new Uint8Array(await file.arrayBuffer());
      this.poller.trackFile(p, fileStamp(file));
      return data;
    } catch (e) {
      throw toBackendError(e, p);
    }
  }

  async writeText(rel: string, text: string): Promise<void> {
    await this.writeBinary(rel, encodeUtf8(text));
  }

  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    const p = this.rel(rel);
    if (p === "") throw new BackendError("프로젝트 루트에 쓰기 불가", "io", p);
    const release = this.poller.hold(p);
    let existed: boolean;
    try {
      const dir = await this.dirHandle(dirname(p), true);
      existed = await this.fileExists(dir, basename(p), p);
      const handle = await dir.getFileHandle(basename(p), { create: true });
      await writeFile(handle, data);
      const stamp = await handle
        .getFile()
        .then(fileStamp)
        .catch(() => null);
      this.poller.noteWrite(p, stamp, hashBytes(data));
    } catch (e) {
      throw toBackendError(e, p);
    } finally {
      release();
    }
    this.dispatch({ path: p, kind: existed ? "modify" : "create", origin: "self" });
  }

  async mkdir(rel: string): Promise<void> {
    const p = this.rel(rel);
    if (p === "") return;
    await this.dirHandle(p, true);
  }

  async remove(rel: string): Promise<void> {
    const p = this.rel(rel);
    if (p === "") throw new BackendError("프로젝트 루트 삭제 불가", "outside_root", p);
    const parent = await this.dirHandle(dirname(p));
    const release = this.poller.hold(p);
    try {
      await parent.removeEntry(basename(p), { recursive: true });
      this.poller.noteDelete(p);
    } catch (e) {
      throw toBackendError(e, p);
    } finally {
      release();
    }
    this.dispatch({ path: p, kind: "delete", origin: "self" });
  }

  async rename(fromRel: string, toRel: string): Promise<void> {
    const from = this.rel(fromRel);
    const to = this.rel(toRel);
    if (from === "" || to === "") throw new BackendError("프로젝트 루트 이동 불가", "outside_root", from === "" ? fromRel : toRel);
    if (from === to) return;
    if (isInside(from, to)) throw new BackendError(`폴더를 그 하위 폴더로 이동 불가: ${from} → ${to}`, "io", to);
    const srcParent = await this.dirHandle(dirname(from));
    const src = await this.childHandle(srcParent, basename(from), from);
    if (await this.exists(to)) throw new BackendError(`이미 있는 경로: ${to}`, "io", to);
    const release = this.poller.hold(from, to);
    try {
      const destDir = await this.dirHandle(dirname(to), true);
      if (!(await this.tryMove(src, destDir, basename(to)))) {
        await copyEntry(src, destDir, basename(to));
        await srcParent.removeEntry(basename(from), { recursive: true });
      }
      this.poller.noteDelete(from);
      if (src.kind === "file") {
        const moved = await this.lookupFileData(to).catch(() => null);
        this.poller.noteWrite(to, moved ? fileStamp(moved) : null);
      } else {
        this.poller.noteMkdir(to, false);
      }
    } catch (e) {
      throw toBackendError(e, from);
    } finally {
      release();
    }
    this.dispatch({ path: from, kind: "delete", origin: "self" });
    this.dispatch({ path: to, kind: "create", origin: "self" });
  }

  async exists(rel: string): Promise<boolean> {
    const p = this.rel(rel);
    if (p === "") return true;
    const parent = await this.lookupDir(dirname(p));
    if (!parent) return false;
    try {
      await this.childHandle(parent, basename(p), p);
      return true;
    } catch (e) {
      if (e instanceof BackendError && e.code === "not_found") return false;
      throw e;
    }
  }

  watch(handler: (e: ChangeEvent) => void): () => void {
    this.watchers.add(handler);
    if (this.rootHandle) this.poller.start();
    return () => {
      this.watchers.delete(handler);
      if (this.watchers.size === 0) this.poller.stop();
    };
  }

  /** 폴링을 바로 한 번 돈다 (테스트와 "지금 확인") */
  pollNow(): Promise<void> {
    return this.rootHandle ? this.poller.poll() : Promise.resolve();
  }

  async hmrPush(_files: HmrFile[], _target?: HmrTarget): Promise<{ count: number }> {
    throw new BackendError("브라우저 폴더 모드에서는 핫 리로드 서버를 지원하지 않습니다. 저장하면 게임 탭의 웹 엔진이 자동으로 다시 시작됩니다.", "unsupported");
  }

  async run(_spec: RunSpec): Promise<RunHandle> {
    throw new BackendError("브라우저 폴더 모드에서는 엔진 프로세스를 실행할 수 없습니다. 게임은 게임 탭(WASM)에서 실행됩니다.", "unsupported");
  }

  /** 폴더를 고르고 기억한다. 돌려주는 키를 open() 에 넘긴다. 취소면 null */
  async pickFolder(): Promise<string | null> {
    const handle = await this.pickHandle();
    if (!handle) return null;
    const record = await this.handles.remember(handle);
    return record.key;
  }

  /** 폴더를 고르기만 하고 기억하지 않는다 (기억은 handles.remember). 취소면 null */
  pickHandle(): Promise<FsDirHandle | null> {
    return this.picker();
  }

  async close(): Promise<void> {
    this.poller.stop();
    this.poller.reset();
    this.watchers.clear();
    this.rootHandle = null;
    this.rootKey = null;
  }

  // ---- 내부 ----

  private dispatch(e: ChangeEvent): void {
    for (const handler of [...this.watchers]) handler(e);
  }

  private rel(input: string): string {
    if (!this.rootHandle) throw new BackendError("열린 프로젝트 없음", "not_open");
    return cleanRel(input);
  }

  private async resolveRoot(root: string): Promise<{ handle: FsDirHandle; name: string; remembered: boolean }> {
    const key = root.trim();
    if (key === OPFS_ROOT || key.startsWith(OPFS_ROOT + ":")) {
      const sub = cleanRel(key.slice(OPFS_ROOT.length + 1));
      let handle = await this.opfsRoot();
      try {
        for (const seg of sub.split("/").filter(Boolean)) handle = await handle.getDirectoryHandle(seg, { create: true });
      } catch (e) {
        throw toBackendError(e, sub);
      }
      return { handle, name: sub === "" ? OPFS_NAME : basename(sub), remembered: false };
    }
    const record = await this.handles.get(key);
    if (!record) throw new BackendError(`최근 폴더 기록이 없습니다 (${key}). 폴더 열기에서 다시 선택하세요.`, "not_found");
    const handle = this.handles.opened(key);
    if (!handle) throw new BackendError(`시작 화면의 다시 열기에서 폴더를 열어야 합니다: ${record.name} (이 페이지에서 아직 불러오지 않았습니다)`, "io");
    return { handle, name: record.name || handle.name, remembered: true };
  }

  /** 폴더 핸들. create 면 없는 폴더를 만들고 알린다 */
  private async dirHandle(rel: string, create = false): Promise<FsDirHandle> {
    let dir = this.rootHandle;
    if (!dir) throw new BackendError("열린 프로젝트 없음", "not_open");
    let cur = "";
    for (const seg of rel.split("/").filter(Boolean)) {
      cur = joinRel(cur, seg);
      try {
        dir = await dir.getDirectoryHandle(seg);
      } catch (e) {
        if (!create || errorName(e) !== "NotFoundError") throw toBackendError(e, cur);
        dir = await this.createDir(dir, seg, cur);
      }
    }
    return dir;
  }

  private async createDir(parent: FsDirHandle, name: string, rel: string): Promise<FsDirHandle> {
    const release = this.poller.hold(rel);
    let made: FsDirHandle;
    try {
      made = await parent.getDirectoryHandle(name, { create: true });
      this.poller.noteMkdir(rel, true);
    } catch (e) {
      throw toBackendError(e, rel);
    } finally {
      release();
    }
    this.dispatch({ path: rel, kind: "create", origin: "self" });
    return made;
  }

  private async fileHandle(rel: string): Promise<FsFileHandle> {
    const dir = await this.dirHandle(dirname(rel));
    try {
      return await dir.getFileHandle(basename(rel));
    } catch (e) {
      throw toBackendError(e, rel);
    }
  }

  private async fileExists(dir: FsDirHandle, name: string, rel: string): Promise<boolean> {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch (e) {
      if (errorName(e) === "NotFoundError") return false;
      throw toBackendError(e, rel);
    }
  }

  /** 이름 하나의 핸들 (파일 먼저, 아니면 폴더). 없으면 not_found */
  private async childHandle(parent: FsDirHandle, name: string, rel: string): Promise<FsHandle> {
    try {
      return await parent.getFileHandle(name);
    } catch (e) {
      if (errorName(e) !== "TypeMismatchError") throw toBackendError(e, rel);
    }
    try {
      return await parent.getDirectoryHandle(name);
    } catch (e) {
      throw toBackendError(e, rel);
    }
  }

  /** 감시용 폴더 핸들: 없으면 null, 다른 실패는 던진다 */
  private async lookupDir(rel: string): Promise<FsDirHandle | null> {
    let dir = this.rootHandle;
    if (!dir) return null;
    try {
      for (const seg of rel.split("/").filter(Boolean)) dir = await dir.getDirectoryHandle(seg);
      return dir;
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  private async lookupFileData(rel: string): Promise<FsFileData | null> {
    const parent = await this.lookupDir(dirname(rel));
    if (!parent) return null;
    try {
      return await (await parent.getFileHandle(basename(rel))).getFile();
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  private async tryMove(src: FsHandle, destDir: FsDirHandle, name: string): Promise<boolean> {
    if (typeof src.move !== "function") return false;
    try {
      await src.move(destDir, name);
      return true;
    } catch (e) {
      // 권한이나 없는 파일은 복사로도 안 된다. 그 밖(지원하지 않는 대상 등)은 복사로 넘어간다
      const n = errorName(e);
      if (n === "NotFoundError" || n === "NotAllowedError" || n === "SecurityError") throw e;
      return false;
    }
  }
}
