// 문서 레지스트리와 dockview 의 문서 탭을 맞춘다.
//   문서가 열리면 가운데 그룹에 탭을 더하고, 탭을 닫으면 문서를 닫고, 활성 탭과 활성 문서를 맞춘다.
//   탭 id 는 "doc:<경로>" (시작 탭은 "doc:welcome"). 레이아웃 JSON 에 남은 문서 탭은 reconcile 이 경로로 다시 연다.
//   옆 문서(SIDE_KINDS, 게임 탭)는 처음에 문서 영역 오른쪽의 새 그룹에 연다. 스크립트를 고치는 동안에도 보이게.
//   사용자가 옮기면 그 자리를 기억해 두었다가 닫고 다시 열 때 그 자리에 연다. 보통 문서는 옆 문서의 그룹에 끼우지 않는다.

import type { DockviewApi, IDockviewPanel } from "dockview";

type IDisposable = { dispose(): void };
import type { Document, DocumentRegistry } from "@initial-editor/core";
import { toPosition, type Direction, type Placement } from "./layoutPresets";
import { WELCOME_KIND } from "./documents/WelcomeDocument";
import { GAME_KIND } from "./gameView/GameDocument";

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

/** 문서 영역 옆 그룹에 따로 여는 문서 종류 */
export const SIDE_KINDS: ReadonlySet<string> = new Set([GAME_KIND]);

/** 옆 문서가 마지막으로 있던 자리: 같은 그룹에 있던 다른 탭, 또는 혼자였으면 보통 문서 그룹에서 본 방향 */
export type SideSpot = { referencePanel: string } | { direction: Exclude<Direction, "within"> };

/** 자리를 고를 때 보는 패널 하나. 문서 탭이면 kind 가 문서 종류, 도구 패널이면 null */
export interface DockPanelInfo {
  id: string;
  kind: string | null;
}

export interface PlacementInput {
  panels: readonly DockPanelInfo[];
  activeId: string | null;
  /** 이 종류의 옆 문서가 마지막으로 있던 자리 */
  sideSpot?: SideSpot | null;
}

/**
 * 새 문서 탭을 놓을 자리.
 *   보통 문서: 활성 보통 문서 탭 옆 > 아무 보통 문서 탭 옆 > 옆 문서만 있으면 그 왼쪽 > 문서 없는 화면의 자리
 *   옆 문서:   기억한 탭의 그룹 > 보통 문서 그룹의 기억한 방향(처음은 오른쪽) > 문서 없는 화면의 자리
 */
export function documentPlacement(input: PlacementInput, kind: string): Placement {
  const isMain = (p: DockPanelInfo) => isMainKind(p.kind);
  const active = input.panels.find((p) => p.id === input.activeId);
  const main = active && isMain(active) ? active : input.panels.find(isMain);
  if (SIDE_KINDS.has(kind)) {
    const spot = input.sideSpot;
    if (spot && "referencePanel" in spot && input.panels.some((p) => p.id === spot.referencePanel)) {
      return { referencePanel: spot.referencePanel, direction: "within" };
    }
    if (main) return { referencePanel: main.id, direction: spot && "direction" in spot ? spot.direction : "right" };
    return emptyAreaPlacement(input.panels);
  }
  if (main) return { referencePanel: main.id, direction: "within" };
  const side = input.panels.find((p) => p.kind !== null);
  if (side) return { referencePanel: side.id, direction: "left" };
  return emptyAreaPlacement(input.panels);
}

/** 문서 탭이 하나도 없을 때: 콘솔 위(가운데) > 계층 오른쪽 > 프로젝트 오른쪽 > 인스펙터 왼쪽 > 화면 오른쪽 */
function emptyAreaPlacement(panels: readonly DockPanelInfo[]): Placement {
  const has = (id: string) => panels.some((p) => p.id === id);
  if (has("console")) return { referencePanel: "console", direction: "above" };
  if (has("hierarchy")) return { referencePanel: "hierarchy", direction: "right" };
  if (has("project")) return { referencePanel: "project", direction: "right" };
  if (has("inspector")) return { referencePanel: "inspector", direction: "left" };
  return { direction: "right" };
}

function isMainKind(kind: string | null): boolean {
  return kind !== null && !SIDE_KINDS.has(kind);
}

/** 문서 탭이면 그 문서 종류, 도구 패널이면 null */
function panelKind(panel: IDockviewPanel): string | null {
  if (!isDocumentPanelId(panel.id)) return null;
  const kind = (panel.params as Partial<DocumentPanelParams> | undefined)?.kind;
  return typeof kind === "string" ? kind : "";
}

/** 두 사각형의 가운데를 이어 본 방향 (b 가 a 의 어느 쪽에 있나). 크기가 없으면(배치 전) null */
export function relativeDirection(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): Exclude<Direction, "within"> | null {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return null;
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "below" : "above";
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
  /** 옆 문서 종류별 마지막 자리 (이 창이 열려 있는 동안) */
  private readonly sideSpots = new Map<string, SideSpot>();

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
      api.onDidLayoutChange(() => {
        if (!this.layout?.applying) this.rememberSideSpots(api);
      }),
    );
  }

  /** 옆 문서 종류의 기억한 자리 (테스트와 검수용) */
  sideSpot(kind: string): SideSpot | null {
    return this.sideSpots.get(kind) ?? null;
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
    const placement = documentPlacement(
      { panels: api.panels.map((p) => ({ id: p.id, kind: panelKind(p) })), activeId: api.activePanel?.id ?? null, sideSpot: this.sideSpots.get(doc.kind) },
      doc.kind,
    );
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

  /**
   * 열린 옆 문서의 지금 자리를 기억한다 (배치가 바뀔 때마다). 같은 그룹에 다른 탭이 있으면 그 탭,
   * 혼자면 보통 문서 그룹에서 본 방향. 떠 있는 그룹이나 아직 크기가 없는 배치는 전의 기억을 둔다
   */
  private rememberSideSpots(api: DockviewApi): void {
    for (const panel of api.panels) {
      const kind = panelKind(panel);
      if (!kind || !SIDE_KINDS.has(kind)) continue;
      const group = panel.group;
      if (!group) continue;
      const other = group.panels.find((p) => p.id !== panel.id);
      if (other) {
        this.sideSpots.set(kind, { referencePanel: other.id });
        continue;
      }
      if (group.api.location.type !== "grid") continue;
      const activeMain = api.activePanel && isMainKind(panelKind(api.activePanel)) ? api.activePanel : undefined;
      const main = activeMain ?? api.panels.find((p) => isMainKind(panelKind(p)));
      if (!main?.group || main.group === group) continue;
      const direction = relativeDirection(main.group.element.getBoundingClientRect(), group.element.getBoundingClientRect());
      if (direction) this.sideSpots.set(kind, { direction });
    }
  }

  private removePanel(doc: Document): void {
    const api = this.api;
    if (!api) return;
    const panel = api.getPanel(documentPanelId(doc));
    if (!panel) return;
    if (SIDE_KINDS.has(doc.kind) && !this.layout?.applying) this.rememberSideSpots(api);
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
