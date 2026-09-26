// 메모리 백엔드: 테스트와 스토리북용 ProjectBackend. 규칙(루트 밖 거부, 변경 알림, 정렬은 호출자)은
// 진짜 백엔드와 같게 유지한다. 적합성 테스트(backend-bridge/test/conformance)가 이것도 돌린다.

import {
  BackendError,
  type BackendCapabilities,
  type ChangeEvent,
  type Entry,
  type HmrFile,
  type HmrTarget,
  type ProjectBackend,
  type ProjectInfo,
  type RunHandle,
  type RunSpec,
} from "../backend";
import { Emitter } from "../events";
import { dirname, normalizeRel } from "../paths";
import { decodeUtf8, encodeUtf8 } from "../utf8";

export class MemoryBackend implements ProjectBackend {
  readonly kind = "bridge" as const;
  readonly capabilities: BackendCapabilities = { run: false, pickFolder: false, watch: true };
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>();
  private root: string | null = null;
  private readonly events = new Emitter<{ change: ChangeEvent }>();
  /** hmrPush 로 받은 묶음 (테스트가 본다) */
  readonly pushed: HmrFile[][] = [];

  constructor(initial: Record<string, string | Uint8Array> = {}) {
    for (const [path, data] of Object.entries(initial)) {
      this.put(normalizeRel(path), typeof data === "string" ? encodeUtf8(data) : data);
    }
  }

  private put(rel: string, data: Uint8Array): void {
    this.files.set(rel, data);
    let d = dirname(rel);
    while (d !== "") {
      this.dirs.add(d);
      d = dirname(d);
    }
  }

  private check(rel: string): string {
    if (this.root === null) throw new BackendError("프로젝트가 열려 있지 않다", "not_open");
    try {
      return normalizeRel(rel);
    } catch (e) {
      throw new BackendError((e as Error).message, "outside_root", rel);
    }
  }

  async open(root: string): Promise<ProjectInfo> {
    this.root = root;
    const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
    return { root, name, hasGameJson: this.files.has("game.json") };
  }

  async list(rel: string): Promise<Entry[]> {
    const dir = this.check(rel);
    if (dir !== "" && !this.dirs.has(dir)) throw new BackendError(`폴더가 없다: ${dir}`, "not_found", dir);
    const out: Entry[] = [];
    const prefix = dir === "" ? "" : dir + "/";
    for (const d of this.dirs) {
      if (d.startsWith(prefix) && d !== dir && !d.slice(prefix.length).includes("/")) {
        out.push({ name: d.slice(prefix.length), path: d, kind: "dir" });
      }
    }
    for (const [f, data] of this.files) {
      if (f.startsWith(prefix) && !f.slice(prefix.length).includes("/")) {
        out.push({ name: f.slice(prefix.length), path: f, kind: "file", size: data.byteLength });
      }
    }
    return out;
  }

  async readText(rel: string): Promise<string> {
    return decodeUtf8(await this.readBinary(rel));
  }

  async readBinary(rel: string): Promise<Uint8Array> {
    const p = this.check(rel);
    const data = this.files.get(p);
    if (!data) throw new BackendError(`파일이 없다: ${p}`, "not_found", p);
    return data;
  }

  async writeText(rel: string, text: string): Promise<void> {
    await this.writeBinary(rel, encodeUtf8(text));
  }

  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    const p = this.check(rel);
    if (p === "" || this.dirs.has(p)) throw new BackendError(`폴더에는 쓸 수 없다: ${p}`, "io", p);
    const existed = this.files.has(p);
    this.put(p, data);
    this.events.emit("change", { path: p, kind: existed ? "modify" : "create", origin: "self" });
  }

  async mkdir(rel: string): Promise<void> {
    const p = this.check(rel);
    if (p === "") return;
    let d = p;
    while (d !== "") {
      this.dirs.add(d);
      d = dirname(d);
    }
    this.events.emit("change", { path: p, kind: "create", origin: "self" });
  }

  async remove(rel: string): Promise<void> {
    const p = this.check(rel);
    if (p === "") throw new BackendError("루트는 지울 수 없다", "io", p);
    if (this.files.delete(p)) {
      this.events.emit("change", { path: p, kind: "delete", origin: "self" });
      return;
    }
    if (!this.dirs.has(p)) throw new BackendError(`없다: ${p}`, "not_found", p);
    for (const f of [...this.files.keys()]) if (f.startsWith(p + "/")) this.files.delete(f);
    for (const d of [...this.dirs]) if (d === p || d.startsWith(p + "/")) this.dirs.delete(d);
    this.events.emit("change", { path: p, kind: "delete", origin: "self" });
  }

  async rename(fromRel: string, toRel: string): Promise<void> {
    const from = this.check(fromRel);
    const to = this.check(toRel);
    if (this.files.has(from)) {
      const data = this.files.get(from)!;
      this.files.delete(from);
      this.put(to, data);
    } else if (this.dirs.has(from)) {
      for (const f of [...this.files.keys()]) {
        if (f.startsWith(from + "/")) {
          const data = this.files.get(f)!;
          this.files.delete(f);
          this.put(to + f.slice(from.length), data);
        }
      }
      for (const d of [...this.dirs]) if (d === from || d.startsWith(from + "/")) this.dirs.delete(d);
      this.dirs.add(to);
    } else {
      throw new BackendError(`없다: ${from}`, "not_found", from);
    }
    this.events.emit("change", { path: from, kind: "delete", origin: "self" });
    this.events.emit("change", { path: to, kind: "create", origin: "self" });
  }

  async exists(rel: string): Promise<boolean> {
    const p = this.check(rel);
    return p === "" || this.files.has(p) || this.dirs.has(p);
  }

  watch(handler: (e: ChangeEvent) => void): () => void {
    return this.events.on("change", handler);
  }

  /** 밖에서 바뀐 것처럼 알린다 (테스트용) */
  simulateExternalChange(rel: string, kind: ChangeEvent["kind"], data?: string): void {
    const p = normalizeRel(rel);
    if (kind === "delete") this.files.delete(p);
    else if (data !== undefined) this.put(p, encodeUtf8(data));
    this.events.emit("change", { path: p, kind, origin: "external" });
  }

  async hmrPush(files: HmrFile[], _target?: HmrTarget): Promise<{ count: number }> {
    this.pushed.push(files);
    return { count: files.length };
  }

  async run(_spec: RunSpec): Promise<RunHandle> {
    throw new BackendError("메모리 백엔드는 엔진을 띄우지 못한다", "unsupported");
  }

  async pickFolder(): Promise<string | null> {
    throw new BackendError("메모리 백엔드에는 폴더 선택이 없다", "unsupported");
  }

  async close(): Promise<void> {
    this.root = null;
  }
}
