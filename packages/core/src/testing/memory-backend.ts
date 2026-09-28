// 메모리 백엔드: 테스트와 스토리북용 ProjectBackend. 규칙(루트 밖 거부, 변경 알림, 정렬은 호출자)은
// 진짜 백엔드와 같게 유지한다. 적합성 테스트(backend-bridge/test/conformance)가 이것도 돌린다.
// 메모리 모드와 웹판의 "샘플로 해 보기"도 이것을 쓴다. 엔진이 없으므로 capabilities.hmr은 false이고(hmrPush는
// 테스트가 보도록 받은 묶음을 pushed 에 남길 뿐이다), 쓴 것은 이 페이지에만 있으므로 volatileWrites로 센다.

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
import { dirname, isInside, normalizeRel } from "../paths";
import { EDITOR_DIR } from "../project";
import { decodeUtf8, encodeUtf8 } from "../utf8";

export class MemoryBackend implements ProjectBackend {
  readonly kind = "bridge" as const;
  readonly capabilities: BackendCapabilities = { run: false, pickFolder: false, watch: true, hmr: false };
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>();
  private root: string | null = null;
  private readonly events = new Emitter<{ change: ChangeEvent }>();
  /** hmrPush 로 받은 묶음 (테스트가 본다) */
  readonly pushed: HmrFile[][] = [];
  /** 이번 세션에 프로젝트에 쓴 횟수 (.initial-editor/ 아래는 빼고). 처음 파일과 밖의 변경 흉내는 세지 않는다 */
  volatileWrites = 0;

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
    if (this.root === null) throw new BackendError("열린 프로젝트 없음", "not_open");
    try {
      return normalizeRel(rel);
    } catch (e) {
      throw new BackendError((e as Error).message, "outside_root", rel);
    }
  }

  /** 쓴 것을 센다. 에디터 자신의 상태(레이아웃 등, 브라우저 저장소에도 남는다)는 세지 않는다 */
  private noteWrite(rel: string): void {
    if (!isInside(EDITOR_DIR, rel)) this.volatileWrites++;
  }

  async open(root: string): Promise<ProjectInfo> {
    this.root = root;
    const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
    return { root, name, hasGameJson: this.files.has("game.json") };
  }

  async list(rel: string): Promise<Entry[]> {
    const dir = this.check(rel);
    if (dir !== "" && !this.dirs.has(dir)) throw new BackendError(`폴더 없음: ${dir}`, "not_found", dir);
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
    if (!data) throw new BackendError(`파일 없음: ${p}`, "not_found", p);
    return data;
  }

  async writeText(rel: string, text: string): Promise<void> {
    await this.writeBinary(rel, encodeUtf8(text));
  }

  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    const p = this.check(rel);
    if (p === "" || this.dirs.has(p)) throw new BackendError(`폴더 경로에 파일 쓰기 불가: ${p}`, "io", p);
    const existed = this.files.has(p);
    this.put(p, data);
    this.noteWrite(p);
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
    this.noteWrite(p);
    this.events.emit("change", { path: p, kind: "create", origin: "self" });
  }

  async remove(rel: string): Promise<void> {
    const p = this.check(rel);
    if (p === "") throw new BackendError("프로젝트 루트 삭제 불가", "io", p);
    if (this.files.delete(p)) {
      this.noteWrite(p);
      this.events.emit("change", { path: p, kind: "delete", origin: "self" });
      return;
    }
    if (!this.dirs.has(p)) throw new BackendError(`파일이나 폴더 없음: ${p}`, "not_found", p);
    for (const f of [...this.files.keys()]) if (f.startsWith(p + "/")) this.files.delete(f);
    for (const d of [...this.dirs]) if (d === p || d.startsWith(p + "/")) this.dirs.delete(d);
    this.noteWrite(p);
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
      throw new BackendError(`파일이나 폴더 없음: ${from}`, "not_found", from);
    }
    if (!isInside(EDITOR_DIR, from) || !isInside(EDITOR_DIR, to)) this.volatileWrites++;
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
    throw new BackendError("메모리 백엔드는 엔진 프로세스 실행 미지원", "unsupported");
  }

  async pickFolder(): Promise<string | null> {
    throw new BackendError("메모리 백엔드는 폴더 선택 미지원", "unsupported");
  }

  async close(): Promise<void> {
    this.root = null;
  }
}
