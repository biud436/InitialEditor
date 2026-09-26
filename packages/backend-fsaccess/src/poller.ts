// 폴링 감시. File System Access API 에는 변경 알림이 없어서 일정 간격(기본 1.5초)으로 훑는다.
//
// 훑는 범위: 목록을 읽은 폴더(루트와 프로젝트 트리가 펼친 폴더)와 읽거나 쓴 파일. 파일은 크기와 마지막 수정 시각을
// 비교한다. 추적하는 폴더 안에 새 폴더가 생기면 그 안의 항목까지 알리고 그 폴더도 추적한다.
//
// 이 백엔드가 한 변경: 바꾸는 동안 hold 로 경로를 잡고, 끝나면 note* 로 스냅숏을 고친다. 훑기는 잡힌 경로와
// 훑는 사이에 고친 경로를 건너뛴다. 그래도 걸린 변경(도장을 못 읽은 쓰기)은 3초 안에 쓴 내용의 해시와 같으면 self 다.

import type { ChangeEvent, ChangeKind } from "@initial-editor/core";

export type Stamp = { kind: "file"; size: number; mtime: number } | { kind: "dir" };

export interface StampedEntry {
  name: string;
  stamp: Stamp;
}

/** 훑기가 파일 시스템을 보는 창구. 백엔드가 핸들로 구현하고 테스트는 가짜로 구현한다 */
export interface PollSource {
  /** 폴더 한 층. 폴더가 없으면 null. 그 밖의 실패는 던진다 (이번 훑기에서 그 폴더를 건너뛴다) */
  listDir(rel: string): Promise<StampedEntry[] | null>;
  /** 파일 하나의 도장. 없으면 null */
  statFile(rel: string): Promise<Stamp | null>;
  /** 파일 내용의 해시 (hash.ts). 없으면 null */
  hashFile(rel: string): Promise<string | null>;
}

export interface PollerOptions {
  intervalMs?: number;
  selfWindowMs?: number;
  now?: () => number;
}

export const DEFAULT_POLL_MS = 1500;
export const SELF_WINDOW_MS = 3000;
export const DIR_STAMP: Stamp = { kind: "dir" };

interface Recent {
  kind: "write" | "mkdir" | "delete";
  hash?: string;
  at: number;
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function join(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

function isUnder(path: string, root: string): boolean {
  return root === "" || path === root || path.startsWith(root + "/");
}

function depth(path: string): number {
  return path === "" ? 0 : path.split("/").length;
}

function sameStamp(a: Stamp, b: Stamp): boolean {
  if (a.kind === "dir" || b.kind === "dir") return a.kind === b.kind;
  return a.size === b.size && a.mtime === b.mtime;
}

export class ChangePoller {
  /** 추적하는 폴더 → 자식 이름 → 도장 */
  private readonly dirs = new Map<string, Map<string, Stamp>>();
  /** 따로 추적하는 파일 (부모 폴더를 추적하지 않을 때). 없으면 null */
  private readonly files = new Map<string, Stamp | null>();
  /** 이 백엔드가 바꾸는 중인 경로 (겹치면 센다) */
  private readonly held = new Map<string, number>();
  /** 경로 → 마지막으로 스냅숏을 고친 순번 */
  private readonly touched = new Map<string, number>();
  private readonly recent = new Map<string, Recent>();
  private seq = 0;
  private epoch = 0;
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scanning: Promise<void> | null = null;
  private readonly intervalMs: number;
  private readonly selfWindowMs: number;
  private readonly now: () => number;

  constructor(
    private readonly source: PollSource,
    private readonly emit: (e: ChangeEvent) => void,
    options: PollerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? DEFAULT_POLL_MS;
    this.selfWindowMs = options.selfWindowMs ?? SELF_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  get running(): boolean {
    return this.active;
  }

  isTrackedDir(rel: string): boolean {
    return this.dirs.has(rel);
  }

  isTrackedFile(rel: string): boolean {
    return this.files.has(rel) || this.dirs.get(parentOf(rel))?.get(nameOf(rel))?.kind === "file";
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.schedule();
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 스냅숏을 비운다 (프로젝트를 열고 닫을 때). 진행 중인 훑기의 결과는 버린다 */
  reset(): void {
    this.epoch++;
    this.dirs.clear();
    this.files.clear();
    this.held.clear();
    this.touched.clear();
    this.recent.clear();
  }

  /** 목록을 읽은 폴더. 이미 추적 중이면 그대로 둔다 (알리지 않은 변경을 삼키지 않게) */
  trackDir(rel: string, entries: readonly StampedEntry[]): void {
    if (this.dirs.has(rel)) return;
    this.dirs.set(rel, new Map(entries.map((e) => [e.name, e.stamp])));
  }

  /** 읽은 파일 */
  trackFile(rel: string, stamp: Stamp | null): void {
    if (this.files.has(rel) || this.dirs.has(parentOf(rel))) return;
    this.files.set(rel, stamp);
  }

  /** 바꾸는 동안 경로(와 그 아래)를 훑기에서 뺀다. 돌려주는 함수로 푼다 */
  hold(...paths: string[]): () => void {
    for (const p of paths) this.held.set(p, (this.held.get(p) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const p of paths) {
        const n = (this.held.get(p) ?? 1) - 1;
        if (n <= 0) this.held.delete(p);
        else this.held.set(p, n);
      }
    };
  }

  /** 이 백엔드가 파일을 썼다. 도장을 못 읽었으면 null (다음 훑기가 해시로 가린다) */
  noteWrite(rel: string, stamp: Stamp | null, hash?: string): void {
    this.touch(rel);
    this.recent.set(rel, { kind: "write", hash, at: this.now() });
    const parent = this.dirs.get(parentOf(rel));
    if (parent) {
      if (stamp) parent.set(nameOf(rel), stamp);
      else parent.delete(nameOf(rel));
    }
    if (!parent || this.files.has(rel)) this.files.set(rel, stamp);
  }

  /** 이 백엔드가 폴더를 만들었다. track 이면 (부모를 추적할 때) 빈 폴더로 추적을 시작한다 */
  noteMkdir(rel: string, track: boolean): void {
    this.touch(rel);
    this.recent.set(rel, { kind: "mkdir", at: this.now() });
    const parent = this.dirs.get(parentOf(rel));
    if (!parent) return;
    parent.set(nameOf(rel), DIR_STAMP);
    if (track && !this.dirs.has(rel)) this.dirs.set(rel, new Map());
  }

  /** 이 백엔드가 지웠다 (폴더면 그 아래까지) */
  noteDelete(rel: string): void {
    this.touch(rel);
    this.recent.set(rel, { kind: "delete", at: this.now() });
    this.dropUnder(rel);
  }

  /** 한 번 훑는다. 이미 훑는 중이면 그것을 기다린다 */
  poll(): Promise<void> {
    if (!this.scanning) this.scanning = this.scan().finally(() => (this.scanning = null));
    return this.scanning;
  }

  // ---- 내부 ----

  private schedule(): void {
    if (!this.active || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this
        .poll()
        .catch(() => {})
        .finally(() => this.schedule());
    }, this.intervalMs);
  }

  private touch(rel: string): void {
    this.touched.set(rel, ++this.seq);
  }

  private isHeld(path: string): boolean {
    for (let p = path; ; p = parentOf(p)) {
      if (this.held.has(p)) return true;
      if (p === "") return false;
    }
  }

  private touchedSince(path: string, seq0: number): boolean {
    for (let p = path; ; p = parentOf(p)) {
      if ((this.touched.get(p) ?? 0) > seq0) return true;
      if (p === "") return false;
    }
  }

  /** rel 과 그 아래를 스냅숏에서 뺀다. 알던 파일과 폴더의 경로를 돌려준다 (지움 알림용) */
  private dropUnder(rel: string): string[] {
    const gone = new Set<string>();
    this.dirs.get(parentOf(rel))?.delete(nameOf(rel));
    for (const [dir, children] of [...this.dirs]) {
      if (dir === "" || !isUnder(dir, rel)) continue;
      for (const name of children.keys()) gone.add(join(dir, name));
      this.dirs.delete(dir);
    }
    for (const [path, stamp] of this.files) {
      if (stamp && isUnder(path, rel)) {
        gone.add(path);
        this.files.set(path, null);
      }
    }
    gone.delete(rel);
    return [...gone];
  }

  private async scan(): Promise<void> {
    const epoch = this.epoch;
    const seq0 = this.seq;
    const now = this.now();
    for (const [p, r] of this.recent) if (now - r.at > this.selfWindowMs) this.recent.delete(p);
    const skip = (path: string) => this.isHeld(path) || this.touchedSince(path, seq0);
    const changes = new Map<string, ChangeKind>();
    const discovered: string[] = [];
    const markGone = (path: string) => {
      for (const g of this.dropUnder(path)) changes.set(g, "delete");
      changes.set(path, "delete");
    };

    const dirs = [...this.dirs.keys()].sort((a, b) => depth(a) - depth(b));
    for (const dir of dirs) {
      if (!this.dirs.has(dir)) continue;
      let listed: StampedEntry[] | null;
      try {
        listed = await this.source.listDir(dir);
      } catch {
        continue;
      }
      if (epoch !== this.epoch) return;
      const children = this.dirs.get(dir);
      if (!children || skip(dir)) continue;
      if (listed !== null) {
        this.diffDir(dir, children, listed, skip, changes, discovered);
      } else if (dir === "") {
        // 루트 폴더가 사라졌다. 루트는 계속 추적한다
        for (const name of [...children.keys()]) if (!skip(name)) markGone(name);
      } else {
        markGone(dir);
      }
    }

    while (discovered.length > 0) {
      const dir = discovered.shift()!;
      if (this.dirs.has(dir) || skip(dir) || this.dirs.get(parentOf(dir))?.get(nameOf(dir))?.kind !== "dir") continue;
      let listed: StampedEntry[] | null;
      try {
        listed = await this.source.listDir(dir);
      } catch {
        continue;
      }
      if (epoch !== this.epoch) return;
      if (listed === null || this.dirs.has(dir) || skip(dir)) continue;
      const children = new Map<string, Stamp>();
      this.dirs.set(dir, children);
      this.diffDir(dir, children, listed, skip, changes, discovered);
    }

    for (const path of [...this.files.keys()]) {
      if (this.dirs.has(parentOf(path))) continue;
      let stamp: Stamp | null;
      try {
        stamp = await this.source.statFile(path);
      } catch {
        continue;
      }
      if (epoch !== this.epoch) return;
      if (!this.files.has(path) || this.dirs.has(parentOf(path)) || skip(path)) continue;
      const old = this.files.get(path) ?? null;
      if (old && !stamp) changes.set(path, "delete");
      else if (!old && stamp) changes.set(path, "create");
      else if (old && stamp && !sameStamp(old, stamp)) changes.set(path, "modify");
      this.files.set(path, stamp);
    }

    for (const [p, s] of this.touched) if (s <= seq0) this.touched.delete(p);

    const events: ChangeEvent[] = [];
    for (const [path, kind] of changes) events.push({ path, kind, origin: await this.originOf(path, kind) });
    if (epoch !== this.epoch) return;
    for (const e of events) this.emit(e);
  }

  private diffDir(
    dir: string,
    children: Map<string, Stamp>,
    listed: readonly StampedEntry[],
    skip: (path: string) => boolean,
    changes: Map<string, ChangeKind>,
    discovered: string[],
  ): void {
    const fresh = new Map(listed.map((e) => [e.name, e.stamp]));
    for (const [name, stamp] of fresh) {
      const path = join(dir, name);
      if (skip(path)) continue;
      const old = children.get(name);
      if (old && old.kind !== stamp.kind) {
        for (const g of this.dropUnder(path)) changes.set(g, "delete");
      }
      if (!old || old.kind !== stamp.kind) {
        changes.set(path, "create");
        if (stamp.kind === "dir") discovered.push(path);
      } else if (!sameStamp(old, stamp)) {
        changes.set(path, "modify");
      }
      children.set(name, stamp);
      if (this.files.has(path)) this.files.set(path, stamp.kind === "file" ? stamp : null);
    }
    for (const name of [...children.keys()]) {
      if (fresh.has(name)) continue;
      const path = join(dir, name);
      if (skip(path)) continue;
      for (const g of this.dropUnder(path)) changes.set(g, "delete");
      changes.set(path, "delete");
    }
  }

  private async originOf(path: string, kind: ChangeKind): Promise<ChangeEvent["origin"]> {
    const now = this.now();
    const fresh = (r: Recent | undefined) => (r && now - r.at <= this.selfWindowMs ? r : undefined);
    if (kind === "delete") {
      for (let p = path; ; p = parentOf(p)) {
        if (fresh(this.recent.get(p))?.kind === "delete") return "self";
        if (p === "") return "external";
      }
    }
    const r = fresh(this.recent.get(path));
    if (!r) return "external";
    if (r.kind === "mkdir") return "self";
    if (r.kind !== "write" || r.hash === undefined) return "external";
    try {
      return (await this.source.hashFile(path)) === r.hash ? "self" : "external";
    } catch {
      return "external";
    }
  }
}
