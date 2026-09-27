// File System Access API 의 메모리 가짜 (Node 테스트용). 명세(WICG File System Access, WHATWG File System)의
// 동작을 따른다.
//   - 핸들은 (루트, 경로) 쌍이다. 크로미움처럼 지우고 같은 이름으로 다시 만들면 옛 핸들이 새 항목을 가리킨다
//   - 없는 항목은 NotFoundError, 종류가 다르면 TypeMismatchError, 차 있는 폴더를 recursive 없이 지우면
//     InvalidModificationError, 잘못된 이름("", ".", "..", "/" 포함)은 TypeError
//   - createWritable 은 스왑 버퍼에 쓰고 close() 에서 한 번에 바꾼다. abort() 는 버린다
//   - getFile() 의 File 은 그 순간의 내용이다. 그 뒤에 파일이 바뀌면 읽을 때 NotReadableError
//   - 권한(queryPermission, requestPermission)과 move() 는 선택이다 (FakeFsOptions)

import type { FsDirHandle, FsFileData, FsFileHandle, FsHandle, FsHandleBase, FsPermissionState, FsWritable } from "../src/types";

interface FileNode {
  kind: "file";
  data: Uint8Array;
  lastModified: number;
  version: number;
}

interface DirNode {
  kind: "directory";
  children: Map<string, FileNode | DirNode>;
}

type Node = FileNode | DirNode;

export interface FakePermission {
  state: FsPermissionState;
  /** requestPermission 이 돌려줄 값 */
  answer: FsPermissionState;
  /** 사용자 제스처 안인가 (아니면 requestPermission 이 SecurityError) */
  gesture: boolean;
  /** requestPermission 을 부른 횟수 */
  asked: number;
}

export interface FakeFsOptions {
  /** 루트 폴더 이름 */
  name?: string;
  /** 권한 흉내 (없으면 queryPermission 도 없다: OPFS 와 같다) */
  permission?: Partial<FakePermission>;
  /** move() 를 줄 것인가. "fail" 이면 있지만 NotSupportedError 로 실패한다 */
  move?: boolean | "fail";
}

function domError(name: string, message: string): Error {
  return new DOMException(message, name);
}

function checkName(name: string): void {
  if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new TypeError(`잘못된 이름: ${JSON.stringify(name)}`);
  }
}

function toBytes(chunk: unknown): Promise<Uint8Array> | Uint8Array {
  if (typeof chunk === "string") return new TextEncoder().encode(chunk);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk.slice(0));
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
  if (chunk && typeof (chunk as Blob).arrayBuffer === "function") return (chunk as Blob).arrayBuffer().then((b) => new Uint8Array(b));
  throw new TypeError("쓸 수 없는 값");
}

export class FakeFs {
  readonly rootNode: DirNode = { kind: "directory", children: new Map() };
  readonly permission: FakePermission | null;
  readonly moveMode: boolean | "fail";
  readonly name: string;
  private clock = 0;

  constructor(options: FakeFsOptions = {}) {
    this.name = options.name ?? "project";
    this.moveMode = options.move ?? false;
    this.permission = options.permission ? { state: "granted", answer: "granted", gesture: false, asked: 0, ...options.permission } : null;
  }

  /** 루트 폴더 핸들 */
  root(): FakeDirHandle {
    return new FakeDirHandle(this, []);
  }

  /** 단조 증가 시각 (같은 밀리초에 두 번 써도 다르다) */
  tick(): number {
    this.clock = Math.max(Date.now(), this.clock + 1);
    return this.clock;
  }

  // ---- 테스트가 핸들 없이 만지는 것 ----

  /** 밖에서 쓴 것처럼 파일을 쓴다 (상위 폴더를 만든다) */
  writeFile(path: string, data: string | Uint8Array): void {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop()!;
    let dir = this.rootNode;
    for (const seg of parts) {
      let next = dir.children.get(seg);
      if (!next) {
        next = { kind: "directory", children: new Map() };
        dir.children.set(seg, next);
      }
      if (next.kind !== "directory") throw new Error(`폴더가 아니다: ${seg}`);
      dir = next;
    }
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const old = dir.children.get(name);
    if (old?.kind === "file") {
      old.data = bytes;
      old.lastModified = this.tick();
      old.version++;
    } else {
      dir.children.set(name, { kind: "file", data: bytes, lastModified: this.tick(), version: 1 });
    }
  }

  readFile(path: string): string | null {
    const node = this.nodeAt(path.split("/").filter(Boolean));
    return node?.kind === "file" ? new TextDecoder().decode(node.data) : null;
  }

  removePath(path: string): void {
    const parts = path.split("/").filter(Boolean);
    const name = parts.pop()!;
    const dir = this.nodeAt(parts);
    if (dir?.kind === "directory") dir.children.delete(name);
  }

  nodeAt(parts: readonly string[]): Node | null {
    let node: Node = this.rootNode;
    for (const seg of parts) {
      if (node.kind !== "directory") return null;
      const next: Node | undefined = node.children.get(seg);
      if (!next) return null;
      node = next;
    }
    return node;
  }

  // ---- 핸들이 쓰는 것 ----

  checkAccess(): void {
    if (this.permission && this.permission.state !== "granted") throw domError("NotAllowedError", "권한이 없다");
  }

  /** 경로의 항목. 없으면 NotFoundError, 중간이 파일이면 TypeMismatchError */
  resolve(parts: readonly string[], kind: Node["kind"]): Node {
    this.checkAccess();
    let node: Node = this.rootNode;
    for (let i = 0; i < parts.length; i++) {
      if (node.kind !== "directory") throw domError("TypeMismatchError", "폴더가 아니다");
      const next: Node | undefined = node.children.get(parts[i]);
      if (!next) throw domError("NotFoundError", `없다: ${parts.slice(0, i + 1).join("/")}`);
      node = next;
    }
    if (node.kind !== kind) throw domError("TypeMismatchError", `종류가 다르다: ${parts.join("/")}`);
    return node;
  }
}

abstract class FakeHandle implements FsHandleBase {
  abstract readonly kind: "file" | "directory";

  constructor(
    readonly fs: FakeFs,
    public path: string[],
  ) {}

  get name(): string {
    return this.path.length === 0 ? this.fs.name : this.path[this.path.length - 1];
  }

  async isSameEntry(other: FsHandleBase): Promise<boolean> {
    return other instanceof FakeHandle && other.fs === this.fs && other.kind === this.kind && other.path.join("/") === this.path.join("/");
  }

  async resolve(descendant: FsHandleBase): Promise<string[] | null> {
    if (!(descendant instanceof FakeHandle) || descendant.fs !== this.fs) return null;
    const mine = this.path.join("/");
    const theirs = descendant.path.join("/");
    if (mine !== "" && theirs !== mine && !theirs.startsWith(mine + "/")) return null;
    return descendant.path.slice(this.path.length);
  }

  get queryPermission(): FsHandleBase["queryPermission"] {
    const permission = this.fs.permission;
    if (!permission) return undefined;
    return async () => permission.state;
  }

  get requestPermission(): FsHandleBase["requestPermission"] {
    const permission = this.fs.permission;
    if (!permission) return undefined;
    return async () => {
      permission.asked++;
      if (!permission.gesture) throw domError("SecurityError", "User activation is required to request permissions.");
      if (permission.state === "prompt") permission.state = permission.answer;
      return permission.state;
    };
  }

  get move(): FsHandleBase["move"] {
    if (!this.fs.moveMode) return undefined;
    return async (destination: FsDirHandle, newName: string) => {
      if (this.fs.moveMode === "fail") throw domError("NotSupportedError", "옮길 수 없는 대상");
      checkName(newName);
      const from = this.path;
      const node = this.fs.resolve(from, this.kind);
      const dest = (destination as unknown as FakeHandle).path;
      const destNode = this.fs.resolve(dest, "directory") as DirNode;
      const target = [...dest, newName].join("/");
      if (target === from.join("/") || target.startsWith(from.join("/") + "/")) throw domError("InvalidModificationError", "자기 안으로");
      if (destNode.children.has(newName)) throw domError("InvalidModificationError", "이미 있다");
      const parent = this.fs.resolve(from.slice(0, -1), "directory") as DirNode;
      parent.children.delete(from[from.length - 1]);
      destNode.children.set(newName, node);
      this.path = [...dest, newName];
    };
  }
}

class FakeFile implements FsFileData {
  readonly type = "";

  constructor(
    private readonly node: FileNode,
    private readonly version: number,
    readonly name: string,
    private readonly bytes: Uint8Array,
    readonly lastModified: number,
  ) {}

  get size(): number {
    return this.bytes.byteLength;
  }

  private check(): void {
    if (this.node.version !== this.version) throw domError("NotReadableError", "File 을 만든 뒤에 파일이 바뀌었다");
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    this.check();
    return this.bytes.slice().buffer;
  }

  async text(): Promise<string> {
    this.check();
    return new TextDecoder().decode(this.bytes);
  }
}

class FakeWritable implements FsWritable {
  private buffer: Uint8Array;
  private position = 0;
  private state: "open" | "closed" | "aborted" = "open";

  constructor(
    private readonly handle: FakeFileHandle,
    initial: Uint8Array,
  ) {
    this.buffer = initial;
  }

  private assertOpen(): void {
    if (this.state !== "open") throw new TypeError("스트림이 닫혔다");
  }

  async write(chunk: unknown): Promise<void> {
    this.assertOpen();
    if (chunk && typeof chunk === "object" && "type" in chunk && typeof (chunk as { type: unknown }).type === "string" && !ArrayBuffer.isView(chunk)) {
      const params = chunk as { type: string; position?: number; size?: number; data?: unknown };
      if (params.type === "seek") return void (this.position = params.position ?? 0);
      if (params.type === "truncate") return this.truncate(params.size ?? 0);
      if (params.position !== undefined) this.position = params.position;
      chunk = params.data;
    }
    const bytes = await toBytes(chunk);
    const end = this.position + bytes.byteLength;
    if (end > this.buffer.byteLength) {
      const grown = new Uint8Array(end);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer.set(bytes, this.position);
    this.position = end;
  }

  async truncate(size: number): Promise<void> {
    this.assertOpen();
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, Math.min(size, this.buffer.byteLength)));
    this.buffer = next;
    this.position = Math.min(this.position, size);
  }

  async close(): Promise<void> {
    this.assertOpen();
    this.state = "closed";
    this.handle.commit(this.buffer);
  }

  async abort(): Promise<void> {
    this.state = "aborted";
  }
}

export class FakeFileHandle extends FakeHandle implements FsFileHandle {
  readonly kind = "file" as const;

  private node(): FileNode {
    return this.fs.resolve(this.path, "file") as FileNode;
  }

  async getFile(): Promise<FsFileData & { text(): Promise<string> }> {
    const node = this.node();
    return new FakeFile(node, node.version, this.name, node.data.slice(), node.lastModified);
  }

  async createWritable(options: { keepExistingData?: boolean } = {}): Promise<FsWritable> {
    const node = this.node();
    return new FakeWritable(this, options.keepExistingData ? node.data.slice() : new Uint8Array());
  }

  /** 스왑 버퍼를 한 번에 바꿔 넣는다. 그 사이 파일이 지워졌으면 부모 폴더 안에 다시 만든다 */
  commit(data: Uint8Array): void {
    const parent = this.fs.resolve(this.path.slice(0, -1), "directory") as DirNode;
    const existing = parent.children.get(this.name);
    if (existing && existing.kind !== "file") throw domError("TypeMismatchError", "폴더가 되었다");
    if (existing) {
      existing.data = data;
      existing.lastModified = this.fs.tick();
      existing.version++;
    } else {
      parent.children.set(this.name, { kind: "file", data, lastModified: this.fs.tick(), version: 1 });
    }
  }
}

export class FakeDirHandle extends FakeHandle implements FsDirHandle {
  readonly kind = "directory" as const;

  private node(): DirNode {
    return this.fs.resolve(this.path, "directory") as DirNode;
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<FakeDirHandle> {
    checkName(name);
    const dir = this.node();
    const child = dir.children.get(name);
    if (child && child.kind !== "directory") throw domError("TypeMismatchError", `파일이다: ${name}`);
    if (!child) {
      if (!options.create) throw domError("NotFoundError", `없다: ${name}`);
      dir.children.set(name, { kind: "directory", children: new Map() });
    }
    return new FakeDirHandle(this.fs, [...this.path, name]);
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFileHandle> {
    checkName(name);
    const dir = this.node();
    const child = dir.children.get(name);
    if (child && child.kind !== "file") throw domError("TypeMismatchError", `폴더다: ${name}`);
    if (!child) {
      if (!options.create) throw domError("NotFoundError", `없다: ${name}`);
      dir.children.set(name, { kind: "file", data: new Uint8Array(), lastModified: this.fs.tick(), version: 1 });
    }
    return new FakeFileHandle(this.fs, [...this.path, name]);
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}): Promise<void> {
    checkName(name);
    const dir = this.node();
    const child = dir.children.get(name);
    if (!child) throw domError("NotFoundError", `없다: ${name}`);
    if (child.kind === "directory" && child.children.size > 0 && !options.recursive) {
      throw domError("InvalidModificationError", `폴더가 비어 있지 않다: ${name}`);
    }
    dir.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, FsHandle]> {
    const names = [...this.node().children.keys()];
    for (const name of names) {
      const child = this.node().children.get(name);
      if (!child) continue;
      const path = [...this.path, name];
      yield [name, child.kind === "file" ? new FakeFileHandle(this.fs, path) : new FakeDirHandle(this.fs, path)];
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    for await (const [name] of this.entries()) yield name;
  }

  async *values(): AsyncIterableIterator<FsHandle> {
    for await (const [, handle] of this.entries()) yield handle;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FsHandle]> {
    return this.entries();
  }
}
