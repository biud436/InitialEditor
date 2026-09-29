// 비주얼 스크립팅 지원 (docs/plans/visual-scripting.md 7절). Editor.graphSupport 로 붙는다.
//   - scripts/components/**/*.graph.json 을 그래프 문서로 연다 (openPath 를 감싼다. 모양이 틀린 파일은 텍스트로 연다)
//   - 새 그래프 컴포넌트 커맨드, 자동 정렬 커맨드, 편집 커맨드(복사, 붙여넣기, 복제, 삭제)의 그래프 쪽
//   - 저장 결과 알림 (생성하지 못했거나 손으로 쓴 파일이 있어 쓰지 않았을 때)과 생성 파일 덮어쓰기
//   - 라이브러리 파일이 바뀌면 그것을 쓰는 열린 그래프를 다시 검사한다
//   - 생성 파일의 줄(콘솔의 오류 링크)에서 그래프의 노드로

import {
  addNode,
  componentNameOfGraph,
  dirname,
  emptyGraph,
  exitsOf,
  generatedFrom,
  GraphDocument,
  GraphFormatError,
  isGraphPath,
  layoutGraph,
  moveNodes,
  parseLink,
  removeNodes,
  serializeGraph,
  type GraphNode,
} from "@initial-editor/core";
import { action, computed, makeObservable, observable } from "mobx";
import type { Editor } from "../Editor";
import type { EditAction } from "../maps/mapClipboard";

const NEED_GRAPH = "활성 그래프 탭 없음";
const NEED_SELECTION = "선택한 노드 없음";

/** 캔버스의 보기 (탭을 오가도 남는다) */
export interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

/** 캔버스에 보내는 요청: 노드로 화면을 옮기고 고른다 */
export interface GraphFocusRequest {
  doc: GraphDocument;
  nodes: string[];
  seq: number;
}

let focusSeq = 0;

export class GraphSupport {
  /** 복사한 노드 (id 는 붙여넣을 때 새로 짓는다) */
  clipboard: GraphNode[] = [];
  private clipboardLayout: Record<string, [number, number]> = {};
  focusRequest: GraphFocusRequest | null = null;
  private readonly viewports = new WeakMap<GraphDocument, GraphViewport>();
  private disposers: Array<() => void> = [];

  constructor(private readonly editor: Editor) {
    makeObservable<GraphSupport, "clipboard">(this, { clipboard: observable.ref, focusRequest: observable.ref, activeGraph: computed, focus: action });
  }

  get activeGraph(): GraphDocument | null {
    const active = this.editor.documents.active;
    return active instanceof GraphDocument ? active : null;
  }

  viewport(doc: GraphDocument): GraphViewport | null {
    return this.viewports.get(doc) ?? null;
  }

  setViewport(doc: GraphDocument, v: GraphViewport): void {
    this.viewports.set(doc, v);
  }

  install(): void {
    const editor = this.editor;
    const original = editor.openPath.bind(editor);
    editor.openPath = async (path: string) => {
      if (!isGraphPath(path)) return original(path);
      await this.openGraph(path, original);
    };
    this.disposers.push(() => {
      editor.openPath = original;
    });
    this.disposers.push(
      editor.events.on("documentSaved", (doc) => {
        if (doc instanceof GraphDocument) this.reportGeneration(doc);
      }),
      editor.events.on("fileChanged", (e) => {
        for (const d of editor.documents.documents) if (d instanceof GraphDocument && d.graph.uses.includes(e.path)) void d.loadLibraries();
      }),
    );
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  /** 그래프를 연다 (이미 열려 있으면 활성으로). 그래프로 읽지 못하면 텍스트로 열고 null */
  async openGraph(path: string, openAsText?: (path: string) => Promise<void>): Promise<GraphDocument | null> {
    const editor = this.editor;
    const existing = editor.documents.findByPath(path);
    if (existing) {
      editor.documents.activate(existing);
      return existing instanceof GraphDocument ? existing : null;
    }
    try {
      const doc = await GraphDocument.open(editor.backend, path);
      const opened = editor.documents.open(doc);
      return opened instanceof GraphDocument ? opened : null;
    } catch (e) {
      if (e instanceof GraphFormatError && openAsText) {
        editor.toasts.warn(`그래프로 읽지 못해 텍스트로 엽니다: ${path} (${e.message})`);
        await openAsText(path);
        return null;
      }
      const message = `${path} 열기 실패: ${(e as Error).message}`;
      editor.log.error("editor", message);
      editor.toasts.error(message);
      return null;
    }
  }

  /** 저장 뒤의 알림. 생성 결과는 콘솔에도 남긴다 */
  private reportGeneration(doc: GraphDocument): void {
    const r = doc.lastGeneration;
    if (!r) return;
    const editor = this.editor;
    if (r.status === "errors") {
      editor.toasts.warn(`그래프에 오류가 ${r.errors}개 있어 코드를 만들지 않았습니다: ${doc.path}`);
      editor.log.warn("editor", `${doc.path}: 오류 ${r.errors}개, 생성 코드는 그대로입니다`);
    } else if (r.status === "blocked") {
      editor.toasts.warn(`손으로 쓴 파일이 있어 생성 코드를 쓰지 않았습니다: ${r.blocked.join(", ")}. 그래프 탭의 "생성 파일 덮어쓰기"로 바꿀 수 있습니다.`);
    }
    if (r.written.length) {
      editor.log.info("editor", `그래프에서 만든 파일: ${r.written.join(", ")}`);
      for (const p of r.written) {
        const open = editor.documents.findByPath(p);
        if (open && !open.dirty) void open.reloadFromDisk().catch(() => {});
      }
      const dirs = new Set(r.written.map(dirname));
      for (const d of dirs) void editor.project.refresh(d).catch(() => {});
    }
  }

  /** 손으로 쓴 파일까지 덮어써 생성한다 (확인 뒤) */
  async overwriteGenerated(doc: GraphDocument): Promise<void> {
    const blocked = doc.lastGeneration?.blocked ?? [];
    const ok = await this.editor.modals.confirm({
      title: "생성 파일 덮어쓰기",
      message: `손으로 쓴 파일을 그래프에서 만든 코드로 덮어씁니다. 이 파일의 내용은 사라집니다.\n${blocked.join("\n")}`,
      okLabel: "덮어쓰기",
      danger: true,
    });
    if (!ok) return;
    const r = await doc.generate(true);
    this.editor.toasts.info(`생성 파일을 썼습니다: ${r.written.join(", ") || "없음"}`);
    this.reportGeneration(doc);
    if (r.written.length) void this.editor.runner?.reload(r.written, { fromSave: true });
  }

  /** 새 그래프 컴포넌트: 시작과 매 틱 이벤트가 든 그래프를 만들고 생성 코드를 쓴 뒤 연다 */
  async createGraph(name: string): Promise<GraphDocument | null> {
    const editor = this.editor;
    const path = `scripts/components/${name}.graph.json`;
    if (!componentNameOfGraph(path)) {
      editor.toasts.warn(`이름은 소문자, 숫자, _ 로 쓰고 폴더는 / 로 나눕니다: ${name}`);
      return null;
    }
    try {
      if (await editor.backend.exists(path)) {
        editor.toasts.warn(`이미 있는 파일: ${path}`);
        return null;
      }
      const g = emptyGraph();
      g.nodes = [{ id: "init", kind: "event.init" }, { id: "update", kind: "event.update" }];
      g.layout = { init: [0, 0], update: [0, 120] };
      await editor.backend.writeText(path, serializeGraph(g));
      await editor.project.refresh(dirname(path)).catch(() => {});
      const doc = await this.openGraph(path);
      if (!doc) return null;
      const r = await doc.generate();
      if (r.status === "blocked") this.reportGeneration(doc);
      for (const p of [path, ...r.written]) await editor.project.refresh(dirname(p)).catch(() => {});
      await editor.tree.reveal(path);
      editor.log.info("editor", `그래프 컴포넌트 생성됨: ${path} (${r.written.join(", ")})`);
      return doc;
    } catch (e) {
      const message = `그래프 생성 실패: ${(e as Error).message}`;
      editor.log.error("editor", message);
      editor.toasts.error(message);
      return null;
    }
  }

  /** 캔버스가 노드로 화면을 옮기고 고르게 한다 */
  focus(doc: GraphDocument, nodes: string[]): void {
    doc.select(nodes);
    this.focusRequest = { doc, nodes, seq: ++focusSeq };
  }

  /**
   * 생성 파일의 줄을 연 그래프의 노드로 바꾼다. 생성 파일이 아니거나 그 줄의 노드를 모르면 false (그러면 파일을 연다).
   * 오류 링크와 "그래프 열기" 단추가 쓴다
   */
  async revealGenerated(path: string, line?: number): Promise<boolean> {
    const editor = this.editor;
    if (!/\.(lua|rb)$/.test(path)) return false;
    let text: string;
    try {
      text = await editor.backend.readText(path);
    } catch {
      return false;
    }
    const graphPath = generatedFrom(text);
    if (!graphPath || !(await editor.backend.exists(graphPath))) return false;
    const doc = await this.openGraph(graphPath);
    if (!doc) return false;
    if (line !== undefined) {
      const node = doc.nodeAtLine(path.endsWith(".rb") ? "ruby" : "lua", line);
      if (node) this.focus(doc, [node]);
    }
    return true;
  }

  // ---- 자동 정렬과 편집 커맨드 ----

  layout(doc: GraphDocument): void {
    const positions = layoutGraph(doc.graph, doc.analysis);
    doc.change("자동 정렬", (g) => moveNodes(g, Object.entries(positions).map(([id, [x, y]]) => ({ id, x, y }))), undefined, true);
  }

  selectedNodes(doc: GraphDocument): GraphNode[] {
    return doc.graph.nodes.filter((n) => doc.selection.has(n.id));
  }

  deleteSelected(doc: GraphDocument): void {
    const ids = [...doc.selection].filter((id) => doc.graph.nodes.some((n) => n.id === id));
    if (!ids.length) return;
    doc.change(ids.length === 1 ? `노드 삭제: ${ids[0]}` : `노드 ${ids.length}개 삭제`, (g) => removeNodes(g, ids));
    doc.clearSelection();
  }

  copy(doc: GraphDocument): number {
    const nodes = this.selectedNodes(doc);
    this.clipboard = nodes.map((n) => JSON.parse(JSON.stringify(n)) as GraphNode);
    this.clipboardLayout = Object.fromEntries(nodes.map((n) => [n.id, doc.graph.layout[n.id] ?? [0, 0]]));
    return nodes.length;
  }

  cut(doc: GraphDocument): void {
    if (this.copy(doc) > 0) this.deleteSelected(doc);
  }

  /** 복사한 노드를 새 id 로 붙여넣는다. 복사한 노드끼리의 연결은 새 id 로 잇고, 밖을 가리키던 값 연결은 남긴다 (실행 출구는 끊는다) */
  paste(doc: GraphDocument, offset: [number, number] = [40, 40]): void {
    const source = this.clipboard;
    if (!source.length) return;
    const pasted: string[] = [];
    doc.change(`노드 ${source.length}개 붙여넣기`, (g) => {
      const ids = new Map<string, string>();
      const copies = source.map((n) => JSON.parse(JSON.stringify(n)) as GraphNode);
      for (const n of copies) {
        const at = this.clipboardLayout[n.id] ?? [0, 0];
        const id = addNode(g, { ...n, id: n.id }, [at[0] + offset[0], at[1] + offset[1]]);
        ids.set(n.id, id);
      }
      const byNew = new Map([...ids.values()].map((id) => [id, g.nodes.find((x) => x.id === id)!]));
      for (const newId of ids.values()) {
        const n = byNew.get(newId)!;
        for (const [exit, target] of exitsOf(n)) {
          const t = ids.get(target);
          if (exit.startsWith("case:")) {
            const v = exit.slice(5);
            if (t) n.cases![v] = t;
            else delete n.cases![v];
          } else if (t) (n as unknown as Record<string, string>)[exit] = t;
          else delete (n as unknown as Record<string, string | undefined>)[exit];
        }
        for (const [port, link] of Object.entries(n.in ?? {})) {
          const ref = parseLink(link);
          const t = ids.get(ref.node);
          if (t) n.in![port] = ref.port === "out" ? t : `${t}.${ref.port}`;
          else if (!g.nodes.some((x) => x.id === ref.node && !ids.has(x.id))) delete n.in![port];
        }
        pasted.push(newId);
      }
    });
    doc.select(pasted);
  }

  duplicate(doc: GraphDocument): void {
    const saved = [this.clipboard, this.clipboardLayout] as const;
    if (this.copy(doc) > 0) this.paste(doc);
    this.clipboard = saved[0];
    this.clipboardLayout = saved[1];
  }

  /** sceneCommands 의 편집 커맨드가 활성 문서가 그래프일 때 부른다 */
  readonly router = {
    active: (): boolean => this.activeGraph !== null,
    enabled: (action: EditAction): boolean => {
      const doc = this.activeGraph;
      if (!doc) return false;
      return action === "paste" ? this.clipboard.length > 0 : doc.selection.size > 0;
    },
    hint: (action: EditAction): string | undefined => {
      const doc = this.activeGraph;
      if (!doc) return NEED_GRAPH;
      if (action === "paste") return this.clipboard.length > 0 ? undefined : "복사한 노드 없음";
      return doc.selection.size > 0 ? undefined : NEED_SELECTION;
    },
    run: (action: EditAction): void => {
      const doc = this.activeGraph;
      if (!doc) return;
      if (action === "copy") {
        const n = this.copy(doc);
        if (n > 0) this.editor.toasts.info(`노드 ${n}개 복사됨`);
      } else if (action === "cut") this.cut(doc);
      else if (action === "paste") this.paste(doc);
      else if (action === "duplicate") this.duplicate(doc);
      else if (action === "delete") this.deleteSelected(doc);
    },
  };
}
