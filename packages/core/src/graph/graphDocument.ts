// 그래프 문서: scripts/components/<경로>.graph.json 하나. 편집 명령은 그래프 전체의 앞뒤 상태를 담는다 (edit.ts 의 순수 함수로 만든다).
// 저장하면 그래프를 쓰고, 오류가 없으면 생성 코드(Lua, Ruby, 선언 파일)를 쓴다. 첫 줄의 생성 표시가 없는 파일(손으로 쓴 파일)은 덮어쓰지 않는다.

import { action, makeObservable, observable, runInAction } from "mobx";
import type { ProjectBackend } from "../backend";
import { Document, type Command } from "../document";
import { basename } from "../paths";
import { generateComponent, generatedFrom, type GeneratedComponent } from "./codegen";
import { loadGraphLibraries } from "./compile";
import { cloneGraph } from "./edit";
import { parseGraph, serializeGraph, type GraphFile } from "./format";
import type { NodeLibrary } from "./library";
import { componentNameOfGraph } from "./names";
import { validateGraph, type GraphAnalysis, type GraphProblem } from "./validate";

export const GRAPH_KIND = "graph";

export interface GenerationResult {
  /** written: 하나 이상 썼다, unchanged: 이미 같다, errors: 그래프 오류로 만들지 않았다, blocked: 손으로 쓴 파일이 있어 쓰지 않은 것이 있다 */
  status: "written" | "unchanged" | "errors" | "blocked";
  written: string[];
  /** 손으로 쓴 파일이라 쓰지 않은 경로 */
  blocked: string[];
  errors: number;
}

export class GraphDocument extends Document {
  graph: GraphFile;
  analysis: GraphAnalysis;
  libraries: ReadonlyMap<string, NodeLibrary | string> = new Map();
  /** 고른 노드 id */
  readonly selection = observable.set<string>();
  lastGeneration: GenerationResult | null = null;
  readonly logicalName: string;
  private libraryKey = "";

  constructor(
    private readonly backend: Pick<ProjectBackend, "readText" | "writeText" | "exists">,
    path: string,
    graph: GraphFile,
  ) {
    super(GRAPH_KIND, path, basename(path));
    const name = componentNameOfGraph(path);
    if (!name) throw new Error(`그래프 파일 경로가 아닙니다: ${path}`);
    this.logicalName = name;
    this.graph = graph;
    this.analysis = validateGraph(graph, { libraries: this.libraries });
    makeObservable(this, {
      graph: observable.ref,
      analysis: observable.ref,
      libraries: observable.ref,
      lastGeneration: observable.ref,
      select: action,
      clearSelection: action,
    });
  }

  /** 파일을 읽어 연다. 모양이 틀리면 GraphFormatError (텍스트로 열 수 있게 여는 쪽이 받는다) */
  static async open(backend: Pick<ProjectBackend, "readText" | "writeText" | "exists">, path: string): Promise<GraphDocument> {
    const text = await backend.readText(path);
    const doc = new GraphDocument(backend, path, parseGraph(text));
    doc.noteDiskText(text);
    await doc.loadLibraries();
    return doc;
  }

  get problems(): GraphProblem[] {
    return this.analysis.problems;
  }

  private async readOrNull(path: string): Promise<string | null> {
    return (await this.backend.exists(path)) ? this.backend.readText(path) : null;
  }

  /** uses 의 라이브러리를 (다시) 읽고 검사한다. 라이브러리 파일이 바뀌었을 때도 부른다 */
  async loadLibraries(): Promise<void> {
    const graph = this.graph;
    const libs = await loadGraphLibraries(graph, (p) => this.readOrNull(p));
    runInAction(() => {
      this.libraryKey = graph.uses.join("\n");
      this.libraries = libs;
      this.revalidate();
    });
  }

  revalidate(): void {
    runInAction(() => (this.analysis = validateGraph(this.graph, { libraries: this.libraries })));
  }

  /** layoutOnly 면 좌표만 바뀌어 검사를 다시 하지 않는다 (노드 끌기) */
  private setGraph(g: GraphFile, layoutOnly = false) {
    this.graph = g;
    if (layoutOnly) return;
    this.revalidate();
    if (g.uses.join("\n") !== this.libraryKey) void this.loadLibraries();
  }

  /**
   * 그래프를 고치는 명령. mutate 는 복사본을 고친다. 같은 coalesceKey 의 연속 명령(노드 끌기)은 하나로 합쳐진다.
   * layoutOnly 는 mutate 가 layout 만 고칠 때다
   */
  edit(label: string, mutate: (g: GraphFile) => void, coalesceKey?: string, layoutOnly = false): Command {
    const before = this.graph;
    const draft = cloneGraph(before);
    mutate(draft);
    const cmd: Command & { after: GraphFile } = {
      label,
      coalesceKey,
      unchanged: JSON.stringify(draft) === JSON.stringify(before),
      after: draft,
      execute: action(() => this.setGraph(cmd.after, layoutOnly)),
      undo: action(() => this.setGraph(before, layoutOnly)),
      merge(next) {
        cmd.after = (next as typeof cmd).after;
        return true;
      },
    };
    return cmd;
  }

  change(label: string, mutate: (g: GraphFile) => void, coalesceKey?: string, layoutOnly = false): void {
    this.apply(this.edit(label, mutate, coalesceKey, layoutOnly));
  }

  select(ids: Iterable<string>, additive = false): void {
    if (!additive) this.selection.clear();
    for (const id of ids) this.selection.add(id);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  text(): string {
    return serializeGraph(this.graph);
  }

  /** 지금 그래프의 생성 코드 (오류가 있으면 null) */
  generated(): GeneratedComponent | null {
    return this.analysis.errors === 0 ? generateComponent(this.analysis, this.logicalName, this.path!) : null;
  }

  /** 생성 코드의 줄(1부터)을 만든 노드 */
  nodeAtLine(language: "lua" | "ruby", line: number): string | null {
    const file = this.generated()?.[language];
    return file?.lines[line - 1] ?? null;
  }

  /** 생성 파일을 쓴다. force 면 손으로 쓴 파일도 덮어쓴다 */
  async generate(force = false): Promise<GenerationResult> {
    const gen = this.generated();
    let result: GenerationResult;
    if (!gen) {
      result = { status: "errors", written: [], blocked: [], errors: this.analysis.errors };
    } else {
      const written: string[] = [];
      const blocked: string[] = [];
      for (const file of [gen.lua, gen.ruby, gen.declaration]) {
        if (!file) continue;
        const existing = await this.readOrNull(file.path);
        if (existing === file.text) continue;
        // 선언 파일은 표시 줄이 없다: 그래프가 매개변수를 선언하면 그래프의 것이다
        const ours = existing === null || file === gen.declaration || generatedFrom(existing) === this.path;
        if (!ours && !force) {
          blocked.push(file.path);
          continue;
        }
        await this.backend.writeText(file.path, file.text);
        written.push(file.path);
      }
      result = { status: blocked.length ? "blocked" : written.length ? "written" : "unchanged", written, blocked, errors: 0 };
    }
    runInAction(() => {
      this.lastGeneration = result;
      this.writtenWithSave = result.written;
    });
    return result;
  }

  async save(): Promise<void> {
    if (!this.path) throw new Error("경로 없는 그래프는 저장할 수 없습니다");
    this.assertCanSave();
    const state = this.undo.stateId;
    const text = this.text();
    await this.backend.writeText(this.path, text);
    this.noteDiskText(text);
    this.markSaved(state);
    await this.generate();
  }

  async reload(): Promise<void> {
    if (!this.path) return;
    const text = await this.backend.readText(this.path);
    const graph = parseGraph(text);
    runInAction(() => {
      this.graph = graph;
      this.undo.clear();
      this.selection.clear();
    });
    this.noteDiskText(text);
    this.markSaved();
    await this.loadLibraries();
  }
}
