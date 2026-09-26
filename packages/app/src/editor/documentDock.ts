// 문서 레지스트리와 dockview 의 문서 탭을 맞춘다.
//   문서가 열리면 가운데 그룹에 탭을 더하고, 탭을 닫으면 문서를 닫고, 활성 탭과 활성 문서를 맞춘다.
//   탭 id 는 "doc:<경로>" (시작 탭은 "doc:welcome"). 레이아웃 JSON 에 남은 문서 탭은 reconcile 이 경로로 다시 연다.

import type { DockviewApi, IDockviewPanel } from "dockview";

type IDisposable = { dispose(): void };
import type { Document, DocumentRegistry } from "@initial-editor/core";
import { toPosition, type Placement } from "./layoutPresets";
import { WELCOME_KIND } from "./documents/WelcomeDocument";

export const DOCUMENT_COMPONENT = "document";
export const DOCUMENT_TAB = "document-tab";
const PREFIX = "doc:";

export interface DocumentPanelParams {
  path: string | null;
  kind: string;
}

export function documentPanelId(doc: Document): string {
  return `${PREFIX}${doc.path ?? doc.kind}`;
}

export function isDocumentPanelId(id: string): boolean {
  return id.startsWith(PREFIX);
}

export interface DocumentDockDeps {
  documents: DocumentRegistry;
  /** 레이아웃에 남아 있던 경로의 문서를 다시 연다 */
  openPath(path: string): Promise<void>;
  openWelcome(): void;
  /** 경로 문서를 열 수 있는가 (프로젝트가 열려 있는가). 아니면 남은 탭은 조용히 지운다 */
  canOpenPaths(): boolean;
  /** 가운데 그룹이 처음 생길 때 콘솔 높이 */
  consoleHeight?: number;
}

export class DocumentDock {
  private api: DockviewApi | null = null;
  private layout: { applying: boolean } | null = null;
  private disposables: Array<IDisposable | (() => void)> = [];
  private closing = new Set<Document>();

  constructor(private readonly deps: DocumentDockDeps) {}

  attach(api: DockviewApi, layout: { applying: boolean }): void {
    this.detach();
    this.api = api;
    this.layout = layout;
    const { documents } = this.deps;
    this.disposables.push(
      documents.events.on("open", (doc) => this.addPanel(doc)),
      documents.events.on("close", (doc) => this.removePanel(doc)),
      documents.events.on("activate", (doc) => {
        if (!doc) return;
        const panel = api.getPanel(documentPanelId(doc));
        if (panel && !panel.api.isActive) panel.api.setActive();
      }),
      api.onDidRemovePanel((panel) => this.onPanelRemoved(panel)),
      api.onDidActivePanelChange((panel) => {
        if (!panel || !isDocumentPanelId(panel.id)) return;
        const doc = this.findDocument(panel.id);
        if (doc && documents.active !== doc) documents.activate(doc);
      }),
    );
  }

  detach(): void {
    for (const d of this.disposables) {
      if (typeof d === "function") d();
      else d.dispose();
    }
    this.disposables = [];
    this.api = null;
    this.layout = null;
  }

  findDocument(panelId: string): Document | undefined {
    return this.deps.documents.documents.find((d) => documentPanelId(d) === panelId);
  }

  /** 레이아웃을 새로 그린 뒤: 문서 없는 탭은 다시 열거나 지우고, 탭 없는 문서는 탭을 더한다 */
  reconcile(): void {
    const api = this.api;
    if (!api) return;
    // 시작 탭을 다시 여는 것이 활성 문서를 바꾸므로, 들어올 때의 활성 문서를 끝에서 되돌린다
    const activeBefore = this.deps.documents.active;
    for (const panel of [...api.panels]) {
      if (!isDocumentPanelId(panel.id)) continue;
      if (this.findDocument(panel.id)) continue;
      const params = (panel.params ?? {}) as Partial<DocumentPanelParams>;
      if (params.kind === WELCOME_KIND) this.deps.openWelcome();
      else if (params.path && this.deps.canOpenPaths()) void this.deps.openPath(params.path);
      else api.removePanel(panel);
    }
    for (const doc of this.deps.documents.documents) this.addPanel(doc);
    if (activeBefore && this.deps.documents.documents.includes(activeBefore)) this.deps.documents.activate(activeBefore);
    const active = this.deps.documents.active;
    if (active) api.getPanel(documentPanelId(active))?.api.setActive();
  }

  private addPanel(doc: Document): void {
    const api = this.api;
    if (!api) return;
    const id = documentPanelId(doc);
    const existing = api.getPanel(id);
    if (existing) {
      if (existing.title !== doc.title) existing.api.setTitle(doc.title);
      if (this.deps.documents.active === doc && !existing.api.isActive) existing.api.setActive();
      return;
    }
    const placement = this.placement(api);
    const params: DocumentPanelParams = { path: doc.path, kind: doc.kind };
    // 새 그룹을 만드는 첫 문서는 활성이어야 내용이 그려진다. 이미 있는 문서 그룹에 끼울 때만 뒤에 둔다
    const joinsGroup = placement.direction === "within";
    api.addPanel<DocumentPanelParams>({
      id,
      component: DOCUMENT_COMPONENT,
      tabComponent: DOCUMENT_TAB,
      title: doc.title,
      params,
      position: toPosition(placement),
      inactive: joinsGroup && this.deps.documents.active !== doc,
    });
    if (placement.referencePanel === "console" && placement.direction === "above") {
      api.getPanel("console")?.api.setSize({ height: this.deps.consoleHeight ?? 200 });
    }
  }

  /** 새 탭을 놓을 자리: 활성 문서 탭 옆 > 아무 문서 탭 옆 > 콘솔 위(가운데) > 계층 오른쪽 > 화면 오른쪽 */
  private placement(api: DockviewApi): Placement {
    const active = api.activePanel;
    if (active && isDocumentPanelId(active.id)) return { referencePanel: active.id, direction: "within" };
    const doc = api.panels.find((p) => isDocumentPanelId(p.id));
    if (doc) return { referencePanel: doc.id, direction: "within" };
    if (api.getPanel("console")) return { referencePanel: "console", direction: "above" };
    if (api.getPanel("hierarchy")) return { referencePanel: "hierarchy", direction: "right" };
    if (api.getPanel("project")) return { referencePanel: "project", direction: "right" };
    if (api.getPanel("inspector")) return { referencePanel: "inspector", direction: "left" };
    return { direction: "right" };
  }

  private removePanel(doc: Document): void {
    const api = this.api;
    if (!api) return;
    const panel = api.getPanel(documentPanelId(doc));
    if (!panel) return;
    this.closing.add(doc);
    try {
      api.removePanel(panel);
    } finally {
      this.closing.delete(doc);
    }
  }

  private onPanelRemoved(panel: IDockviewPanel): void {
    if (this.layout?.applying || !isDocumentPanelId(panel.id)) return;
    const doc = this.findDocument(panel.id);
    if (!doc || this.closing.has(doc)) return;
    this.deps.documents.close(doc);
  }
}
