// 기억한 폴더. IndexedDB "initial-editor" 에 두 저장소를 둔다.
//   "handles": 키 → 폴더 핸들 (구조화 복제로 그대로 들어간다)
//   "folders": 키 → 이름과 마지막으로 연 시각 (목록용)
// 크로미움의 시크릿 프로필(시크릿 창, Playwright 의 기본 컨텍스트)에서는 IndexedDB 에서 폴더 핸들을 꺼내는 순간
// 탭이 아니라 브라우저 프로세스가 통째로 죽는다 (SIGTRAP). 시크릿 창의 저장소도 함께 사라진다. 그래서
//   - 목록과 폴더 열기(remember)는 핸들을 꺼내지 않는다. 기억은 폴더 이름으로 하고, 같은 이름을 다시 고르면
//     그 기록의 핸들과 시각을 바꾼다 (새것이 이긴다)
//   - 핸들은 다시 열기(restore)에서만, 일반 프로필로 보일 때만 꺼낸다 (profile.ts). 아니면 폴더 고르기로 돈다
//   - 꺼내는 동안 localStorage 에 표시를 남긴다. 다음에 페이지가 떴을 때 몇 분 안의 표시가 남아 있으면
//     꺼내다 죽은 것이므로 그 페이지에서는 꺼내지 않는다. 폴더를 하나라도 열면 표시를 지운다
// 권한은 브라우저가 기억하지 않았으면 다시 열 때 한 번 더 묻는다 (클릭 안에서만 된다).

import { BackendError } from "@initial-editor/core";
import { detectOffTheRecord } from "./profile";
import type { FsDirHandle } from "./types";

export interface FolderRecord {
  /** open() 에 넘기는 키 */
  key: string;
  /** 폴더 이름 (표시용이자 기억의 기준. 브라우저는 절대 경로를 알려 주지 않는다) */
  name: string;
  /** 마지막으로 연 시각 (epoch ms) */
  openedAt: number;
}

/** 저장소. IndexedDB 와 메모리(테스트, IndexedDB 가 없는 곳) 둘 */
export interface FolderTable {
  /** 목록. 핸들은 꺼내지 않는다 */
  list(): Promise<FolderRecord[]>;
  getHandle(key: string): Promise<FsDirHandle | undefined>;
  /** handle 이 있으면 함께 쓴다 */
  put(record: FolderRecord, handle?: FsDirHandle): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MAX_FOLDERS = 10;
export const HANDLE_DB = "initial-editor";
export const HANDLE_STORE = "handles";
export const FOLDER_STORE = "folders";
export const RESTORE_GUARD_KEY = "initial-editor.folders.restoring";
/** 표시가 이보다 오래되면 무시한다 (우연히 남은 표시가 오래 막지 않게) */
export const RESTORE_GUARD_TTL_MS = 5 * 60 * 1000;
/** 시크릿 프로필일 수 있어 다시 열기가 폴더 고르기로 돌 때 */
export const PRIVATE_PROFILE_MESSAGE = "시크릿 창일 수 있어 기억한 폴더를 바로 꺼내지 않는다 (꺼내다 브라우저가 통째로 꺼진다). 폴더 고르기에서 같은 폴더를 고른다";
/** 지난번에 핸들을 꺼내다 페이지가 끝나 다시 열기가 폴더 고르기로 돌 때 */
export const NO_RESTORE_MESSAGE = "지난번에 기억한 폴더를 꺼내다 브라우저가 꺼졌다. 폴더 고르기에서 같은 폴더를 고른다";

function newKey(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const rand = typeof c?.randomUUID === "function" ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `folder-${Date.now().toString(36)}-${rand}`;
}

/** 핸들을 꺼내는 동안 표시를 남기고, 지난번에 꺼내다 죽었는지 알려 준다 */
export class RestoreGuard {
  /** 페이지가 뜰 때 몇 분 안의 표시가 남아 있었다. 이 페이지에서는 핸들을 꺼내지 않는다 */
  readonly crashed: boolean;
  private inflight = 0;

  constructor(
    private readonly storage: KeyValueStore | null,
    private readonly now: () => number = () => Date.now(),
  ) {
    let crashed = false;
    try {
      const at = Number(storage?.getItem(RESTORE_GUARD_KEY) ?? NaN);
      crashed = Number.isFinite(at) && now() - at < RESTORE_GUARD_TTL_MS;
    } catch {
      crashed = false;
    }
    this.crashed = crashed;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.crashed) throw new BackendError(NO_RESTORE_MESSAGE, "unsupported");
    this.mark(true);
    try {
      return await fn();
    } finally {
      this.mark(false);
    }
  }

  /** 폴더를 열었다: 남은 표시를 지운다 (꺼내는 중이면 끝날 때 지운다) */
  clear(): void {
    if (this.inflight > 0) return;
    try {
      this.storage?.removeItem(RESTORE_GUARD_KEY);
    } catch {
      /* 저장소를 못 쓰면 둔다 */
    }
  }

  private mark(on: boolean): void {
    this.inflight += on ? 1 : -1;
    try {
      if (on && this.inflight === 1) this.storage?.setItem(RESTORE_GUARD_KEY, String(this.now()));
      if (!on && this.inflight === 0) this.storage?.removeItem(RESTORE_GUARD_KEY);
    } catch {
      /* 저장소를 못 쓰면 표시 없이 간다 */
    }
  }
}

export interface HandleStoreOptions {
  /** 꺼내다 죽은 표시 (기본: 표시 없음) */
  guard?: RestoreGuard;
  now?: () => number;
  /** 시크릿 프로필일 수 있는가 (기본: 아니다. createHandleStore 는 profile.ts 로 잰다) */
  offTheRecord?: () => Promise<boolean>;
}

export class HandleStore {
  /** 이 페이지에서 고르거나 꺼낸 핸들 (다시 꺼내지 않는다) */
  private readonly live = new Map<string, FsDirHandle>();
  private readonly guard: RestoreGuard;
  private readonly now: () => number;
  private readonly detect: () => Promise<boolean>;
  private privateProfile: Promise<boolean> | null = null;

  constructor(
    private readonly table: FolderTable,
    options: HandleStoreOptions = {},
  ) {
    this.guard = options.guard ?? new RestoreGuard(null);
    this.now = options.now ?? (() => Date.now());
    this.detect = options.offTheRecord ?? (async () => false);
  }

  /** 시크릿 프로필일 수 있는가 (한 번만 잰다. 재다 실패하면 그렇다고 본다) */
  mayBeOffTheRecord(): Promise<boolean> {
    this.privateProfile ??= this.detect().catch(() => true);
    return this.privateProfile;
  }

  /** 이 페이지에서 고르거나 꺼낸 핸들. IndexedDB 는 읽지 않는다 */
  opened(key: string): FsDirHandle | undefined {
    return this.live.get(key);
  }

  /** 기억한 폴더를 꺼내지 않고 폴더 고르기로 돌려야 하는 이유. 없으면(이 페이지에서 연 것, 일반 프로필) null */
  async restoreBlocker(key?: string): Promise<string | null> {
    if (key !== undefined && this.live.has(key)) return null;
    if (await this.mayBeOffTheRecord()) return PRIVATE_PROFILE_MESSAGE;
    if (this.guard.crashed) return NO_RESTORE_MESSAGE;
    return null;
  }

  /** 최근에 연 순서, 이름마다 하나 (이름이 같은 기록이 여럿이면 새것만 남기고 나머지는 지운다) */
  async list(): Promise<FolderRecord[]> {
    const all = (await this.table.list()).sort((a, b) => b.openedAt - a.openedAt);
    const seen = new Set<string>();
    const out: FolderRecord[] = [];
    for (const r of all) {
      if (seen.has(r.name)) {
        this.live.delete(r.key);
        await this.table.delete(r.key).catch(() => {});
        continue;
      }
      seen.add(r.name);
      out.push(r);
    }
    return out;
  }

  async get(key: string): Promise<FolderRecord | undefined> {
    return (await this.table.list()).find((r) => r.key === key);
  }

  /**
   * 다시 열기: 기억한 핸들을 IndexedDB 에서 꺼낸다 (이 페이지에서 연 것이면 그것). 시크릿 프로필일 수 있거나
   * 지난번에 꺼내다 죽었으면 꺼내지 않고 unsupported 를 던진다 (restoreBlocker 의 문장)
   */
  async restore(key: string): Promise<FsDirHandle | undefined> {
    const known = this.live.get(key);
    if (known) return known;
    const blocker = await this.restoreBlocker(key);
    if (blocker) throw new BackendError(blocker, "unsupported");
    const handle = await this.guard.run(() => this.table.getHandle(key));
    if (handle) this.live.set(key, handle);
    return handle;
  }

  /**
   * 새로 고른 폴더를 기억한다. 기억한 핸들은 꺼내지 않는다: 이름이 같은 기록이 있으면 그 키에 이 핸들과 시각을
   * 쓰고, 없으면 새 기록을 만든다. MAX_FOLDERS 를 넘으면 오래된 것을 잊는다
   */
  async remember(handle: FsDirHandle): Promise<FolderRecord> {
    const all = await this.list();
    const same = all.find((r) => r.name === handle.name);
    const record: FolderRecord = same ? { ...same, openedAt: this.now() } : { key: newKey(), name: handle.name, openedAt: this.now() };
    await this.table.put(record, handle);
    this.live.set(record.key, handle);
    if (!same) for (const old of all.slice(MAX_FOLDERS - 1)) await this.forget(old.key);
    return record;
  }

  /** 폴더를 열었다: 꺼내다 죽은 표시를 지운다 */
  markOpened(): void {
    this.guard.clear();
  }

  async touch(key: string): Promise<void> {
    const r = await this.get(key);
    if (r) await this.table.put({ ...r, openedAt: this.now() });
  }

  async forget(key: string): Promise<void> {
    this.live.delete(key);
    await this.table.delete(key);
  }
}

export class MemoryFolderTable implements FolderTable {
  readonly records = new Map<string, FolderRecord>();
  readonly handles = new Map<string, FsDirHandle>();

  async list(): Promise<FolderRecord[]> {
    return [...this.records.values()];
  }

  async getHandle(key: string): Promise<FsDirHandle | undefined> {
    return this.handles.get(key);
  }

  async put(record: FolderRecord, handle?: FsDirHandle): Promise<void> {
    this.records.set(record.key, record);
    if (handle) this.handles.set(record.key, handle);
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
    this.handles.delete(key);
  }
}

function requestResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class IdbFolderTable implements FolderTable {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly dbName = HANDLE_DB) {}

  async list(): Promise<FolderRecord[]> {
    const db = await this.open();
    return requestResult(db.transaction(FOLDER_STORE, "readonly").objectStore(FOLDER_STORE).getAll() as IDBRequest<FolderRecord[]>);
  }

  async getHandle(key: string): Promise<FsDirHandle | undefined> {
    const db = await this.open();
    const row = await requestResult(db.transaction(HANDLE_STORE, "readonly").objectStore(HANDLE_STORE).get(key) as IDBRequest<{ handle?: FsDirHandle } | undefined>);
    return row?.handle;
  }

  async put(record: FolderRecord, handle?: FsDirHandle): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([FOLDER_STORE, HANDLE_STORE], "readwrite");
    tx.objectStore(FOLDER_STORE).put(record);
    if (handle) tx.objectStore(HANDLE_STORE).put({ key: record.key, handle });
    await transactionDone(tx);
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([FOLDER_STORE, HANDLE_STORE], "readwrite");
    tx.objectStore(FOLDER_STORE).delete(key);
    tx.objectStore(HANDLE_STORE).delete(key);
    await transactionDone(tx);
  }

  /** 버전 없이 열고, 저장소가 모자라면 (다른 코드가 먼저 만든 DB) 버전을 올려 만든다 */
  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    const hasStores = (db: IDBDatabase) => db.objectStoreNames.contains(HANDLE_STORE) && db.objectStoreNames.contains(FOLDER_STORE);
    const opened = (req: IDBOpenDBRequest) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const name of [HANDLE_STORE, FOLDER_STORE]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "key" });
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.db = null;
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
    const pending = opened(indexedDB.open(this.dbName)).then((db) => {
      if (hasStores(db)) return db;
      const version = db.version + 1;
      db.close();
      return opened(indexedDB.open(this.dbName, version));
    });
    pending.catch(() => (this.db = null));
    this.db = pending;
    return pending;
  }
}

function localStore(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/** 브라우저면 IndexedDB 와 localStorage 표시와 시크릿 짐작, 아니면 메모리 */
export function createHandleStore(): HandleStore {
  if (typeof indexedDB === "undefined") return new HandleStore(new MemoryFolderTable());
  return new HandleStore(new IdbFolderTable(), { guard: new RestoreGuard(localStore()), offTheRecord: () => detectOffTheRecord() });
}
