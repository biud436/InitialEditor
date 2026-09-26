// 기억한 폴더. IndexedDB "initial-editor" 에 두 저장소를 둔다.
//   "handles": 키 → 폴더 핸들 (구조화 복제로 그대로 들어간다)
//   "folders": 키 → 이름과 마지막으로 연 시각 (목록용)
// 목록은 "folders" 만 읽는다. 크로미움의 시크릿 창(off-the-record)에서는 IndexedDB 에서 폴더 핸들을 꺼내는 순간
// 탭이 죽는 것을 보았다 (Playwright 컨텍스트에서 재현). 그래서 핸들은 다시 열 때만 꺼내고, 꺼내는 동안
// localStorage 에 표시를 남긴다. 다음에 페이지가 떴을 때 표시가 남아 있으면 꺼내다 죽은 것이므로 다시 열기를 끈다.
// 권한은 브라우저가 기억하지 않았으면 다시 열 때 한 번 더 묻는다 (클릭 안에서만 된다).

import { BackendError } from "@initial-editor/core";
import type { FsDirHandle } from "./types";

export interface FolderRecord {
  /** open() 에 넘기는 키 */
  key: string;
  /** 폴더 이름 (표시용. 브라우저는 절대 경로를 알려 주지 않는다) */
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
/** 표시가 이보다 오래되면 무시한다 (일반 창에서 우연히 남은 표시가 영영 막지 않게) */
export const RESTORE_GUARD_TTL_MS = 12 * 60 * 60 * 1000;
export const NO_RESTORE_MESSAGE = "이 창에서는 기억한 폴더를 다시 열 수 없다 (시크릿 창 등에서 폴더를 꺼내다 탭이 멈췄다). 폴더 열기로 다시 고른다";

function newKey(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const rand = typeof c?.randomUUID === "function" ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `folder-${Date.now().toString(36)}-${rand}`;
}

/** 핸들을 꺼내는 동안 표시를 남기고, 지난번에 꺼내다 죽었는지 알려 준다 */
export class RestoreGuard {
  /** 페이지가 뜰 때 표시가 남아 있었다 */
  readonly crashed: boolean;
  private inflight = 0;

  constructor(
    private readonly storage: KeyValueStore | null,
    now: () => number = () => Date.now(),
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

  private mark(on: boolean): void {
    this.inflight += on ? 1 : -1;
    try {
      if (on && this.inflight === 1) this.storage?.setItem(RESTORE_GUARD_KEY, String(Date.now()));
      if (!on && this.inflight === 0) this.storage?.removeItem(RESTORE_GUARD_KEY);
    } catch {
      /* 저장소를 못 쓰면 표시 없이 간다 */
    }
  }
}

export class HandleStore {
  /** 이 페이지에서 고르거나 꺼낸 핸들 (다시 꺼내지 않는다) */
  private readonly live = new Map<string, FsDirHandle>();

  constructor(
    private readonly table: FolderTable,
    private readonly guard: RestoreGuard = new RestoreGuard(null),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** 기억한 폴더를 다시 열 수 있는가 (이 페이지에서 고른 것은 늘 된다) */
  canRestore(key?: string): boolean {
    return !this.guard.crashed || (key !== undefined && this.live.has(key));
  }

  /** 최근에 연 순서 */
  async list(): Promise<FolderRecord[]> {
    return (await this.table.list()).sort((a, b) => b.openedAt - a.openedAt);
  }

  async get(key: string): Promise<FolderRecord | undefined> {
    return (await this.table.list()).find((r) => r.key === key);
  }

  /** 폴더 핸들. 이 페이지에서 처음이면 IndexedDB 에서 꺼낸다 (표시를 남기고) */
  async handle(key: string): Promise<FsDirHandle | undefined> {
    const known = this.live.get(key);
    if (known) return known;
    const handle = await this.guard.run(() => this.table.getHandle(key));
    if (handle) this.live.set(key, handle);
    return handle;
  }

  /** 새로 고른 폴더를 기억한다. 이미 기억한 폴더면 그 키를 다시 쓴다. MAX_FOLDERS 를 넘으면 오래된 것을 잊는다 */
  async remember(handle: FsDirHandle): Promise<FolderRecord> {
    const all = await this.list();
    for (const r of all) {
      // 이름이 같은 것만 핸들을 꺼내 비교한다 (꺼내기를 줄인다)
      if (!this.live.has(r.key) && (r.name !== handle.name || !this.canRestore())) continue;
      const other = await this.handle(r.key).catch(() => undefined);
      if (other && (await other.isSameEntry(handle).catch(() => false))) {
        const next = { ...r, name: handle.name, openedAt: this.now() };
        await this.table.put(next, handle);
        this.live.set(r.key, handle);
        return next;
      }
    }
    const record: FolderRecord = { key: newKey(), name: handle.name, openedAt: this.now() };
    await this.table.put(record, handle);
    this.live.set(record.key, handle);
    for (const old of all.slice(MAX_FOLDERS - 1)) await this.forget(old.key);
    return record;
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

/** 브라우저면 IndexedDB 와 localStorage 표시, 아니면 메모리 */
export function createHandleStore(): HandleStore {
  const table = typeof indexedDB !== "undefined" ? new IdbFolderTable() : new MemoryFolderTable();
  return new HandleStore(table, new RestoreGuard(localStore()));
}
