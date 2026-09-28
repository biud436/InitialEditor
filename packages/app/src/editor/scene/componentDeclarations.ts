// 컴포넌트 매개변수 선언 파일(scripts/<논리 이름>.json)을 읽어 두는 곳. 인스펙터의 매개변수 폼과 씬 검사가 읽는다.
// 처음 물을 때 백엔드로 읽고, 그 파일이 바뀌면(만들기, 고치기, 지우기) 다시 읽는다. 답이 바뀌면 changed 를 알린다.

import {
  BackendError,
  ComponentDeclarationError,
  componentDeclarationPath,
  componentNameFromDeclarationPath,
  Emitter,
  parseComponentDeclaration,
  type ComponentDeclarationState,
  type ProjectBackend,
} from "@initial-editor/core";
import { observable, runInAction } from "mobx";

export class ComponentDeclarations {
  /** 논리 이름 → 상태 (관찰 가능: 인스펙터가 답이 오면 다시 그린다) */
  private readonly known = observable.map<string, ComponentDeclarationState>({}, { deep: false });
  /** 읽는 중인 이름 → 요청 번호와 끝나는 약속 (늦게 온 옛 답을 버린다) */
  private readonly pending = new Map<string, { run: number; done: Promise<void> }>();
  private seq = 0;
  readonly events = new Emitter<{ changed: string }>();

  constructor(private readonly backend: () => ProjectBackend) {}

  /** 선언 상태. 아직 모르면 undefined 를 주고 읽기 시작한다 */
  lookup(logicalName: string): ComponentDeclarationState | undefined {
    if (!this.known.has(logicalName) && !this.pending.has(logicalName)) this.load(logicalName);
    return this.known.get(logicalName);
  }

  /** 읽기가 끝날 때까지 기다린 상태 (테스트와 선언 파일을 만든 직후에 쓴다) */
  async resolve(logicalName: string): Promise<ComponentDeclarationState> {
    this.lookup(logicalName);
    for (let p = this.pending.get(logicalName); p; p = this.pending.get(logicalName)) await p.done;
    return (
      this.known.get(logicalName) ?? {
        kind: "none",
        path: componentDeclarationPath(logicalName),
      }
    );
  }

  /** 프로젝트 파일 하나가 바뀌었다. 선언 파일이거나 그것을 담은 폴더면 다시 읽는다 */
  fileChanged(path: string): void {
    const direct = componentNameFromDeclarationPath(path);
    for (const name of new Set([...this.known.keys(), ...this.pending.keys()])) {
      const file = componentDeclarationPath(name);
      if (name === direct || file.startsWith(`${path}/`)) this.load(name);
    }
  }

  clear(): void {
    runInAction(() => this.known.clear());
    this.pending.clear();
  }

  private load(name: string): void {
    const run = ++this.seq;
    const settle = (state: ComponentDeclarationState) => {
      if (this.pending.get(name)?.run !== run) return;
      this.pending.delete(name);
      const before = this.known.get(name);
      runInAction(() => this.known.set(name, state));
      if (!sameState(before, state)) this.events.emit("changed", name);
    };
    const path = componentDeclarationPath(name);
    const done = this.read(name).then(settle, (e: unknown) =>
      settle({
        kind: "broken",
        path,
        message: `읽기 실패: ${e instanceof Error ? e.message : String(e)}`,
      }),
    );
    this.pending.set(name, { run, done });
  }

  private async read(name: string): Promise<ComponentDeclarationState> {
    const path = componentDeclarationPath(name);
    const backend = this.backend();
    let text: string;
    try {
      text = await backend.readText(path);
    } catch (e) {
      if (e instanceof BackendError && e.code === "not_found") return { kind: "none", path };
      const exists = await backend.exists(path).catch(() => false);
      return exists
        ? {
            kind: "broken",
            path,
            message: `읽기 실패: ${(e as Error).message}`,
          }
        : { kind: "none", path };
    }
    try {
      return {
        kind: "declared",
        path,
        declaration: parseComponentDeclaration(text),
      };
    } catch (e) {
      if (e instanceof ComponentDeclarationError) return { kind: "broken", path, message: e.message };
      throw e;
    }
  }
}

function sameState(a: ComponentDeclarationState | undefined, b: ComponentDeclarationState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
