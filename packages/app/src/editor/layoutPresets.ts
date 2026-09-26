// 도킹 프리셋 셋 (02-scope-and-screens.md 3절 "레이아웃"). 씬(기본), 스크립트, 타일맵(맵 편집).
// JSON 을 손으로 적지 않고 addPanel 의 상대 위치로 짓는다. dockview 의 직렬화 모양이 바뀌어도 살아남게.

import type { AddPanelOptions, DockviewApi } from "dockview";

export const PANEL_IDS = ["hierarchy", "project", "inspector", "extensions", "console", "find", "mapObjects", "mapPalette", "mapLayers"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  hierarchy: "계층",
  project: "프로젝트",
  inspector: "인스펙터",
  extensions: "확장 패널",
  console: "콘솔",
  find: "찾기",
  mapObjects: "맵 오브젝트",
  mapPalette: "팔레트",
  mapLayers: "레이어",
};

export type PresetName = "scene" | "script" | "tilemap";

export const PRESET_LABELS: Record<PresetName, string> = { scene: "씬", script: "스크립트", tilemap: "타일맵" };

export type Direction = "left" | "right" | "above" | "below" | "within";

export interface Placement {
  referencePanel?: string;
  direction?: Direction;
}

export function toPosition(p: Placement | undefined): AddPanelOptions["position"] {
  if (!p) return undefined;
  if (p.referencePanel) return { referencePanel: p.referencePanel, direction: p.direction };
  return { direction: (p.direction ?? "right") as "left" | "right" | "above" | "below" };
}

export function addToolPanel(api: DockviewApi, id: PanelId, placement?: Placement): void {
  if (api.getPanel(id)) return;
  // inactive 로 더하면 새 그룹에 활성 패널이 없어 내용이 안 그려진다. 활성으로 더하고 문서 쪽이 뒤에 초점을 되찾는다
  api.addPanel({ id, component: id, title: PANEL_TITLES[id], position: toPosition(placement ?? defaultPlacement(api, id)) });
}

export function firstDocPanelId(api: DockviewApi): string | undefined {
  return api.panels.find((p) => p.id.startsWith("doc:"))?.id;
}

/** 창 메뉴에서 켤 때 놓을 자리. 이웃이 있으면 그 옆, 없으면 화면 가장자리 */
export function defaultPlacement(api: DockviewApi, id: PanelId): Placement {
  const has = (p: string) => !!api.getPanel(p);
  const doc = firstDocPanelId(api);
  switch (id) {
    case "hierarchy":
      if (has("project")) return { referencePanel: "project", direction: "above" };
      return doc ? { referencePanel: doc, direction: "left" } : { direction: "left" };
    case "project":
      if (has("hierarchy")) return { referencePanel: "hierarchy", direction: "below" };
      return doc ? { referencePanel: doc, direction: "left" } : { direction: "left" };
    case "inspector":
      if (has("extensions")) return { referencePanel: "extensions", direction: "above" };
      return doc ? { referencePanel: doc, direction: "right" } : { direction: "right" };
    case "extensions":
      if (has("inspector")) return { referencePanel: "inspector", direction: "below" };
      return doc ? { referencePanel: doc, direction: "right" } : { direction: "right" };
    case "console":
      return doc ? { referencePanel: doc, direction: "below" } : { direction: "below" };
    case "find":
      // 프로젝트 찾기(E1)는 콘솔 옆 탭으로. 콘솔이 없으면 문서 아래
      if (has("console")) return { referencePanel: "console", direction: "within" };
      return doc ? { referencePanel: doc, direction: "below" } : { direction: "below" };
    case "mapObjects":
      // 맵 오브젝트 목록(E3)은 계층 옆 탭으로
      if (has("hierarchy")) return { referencePanel: "hierarchy", direction: "within" };
      return doc ? { referencePanel: doc, direction: "left" } : { direction: "left" };
    case "mapPalette":
      // 타일 팔레트(E3)는 왼쪽 아래
      if (has("hierarchy")) return { referencePanel: "hierarchy", direction: "below" };
      if (has("project")) return { referencePanel: "project", direction: "below" };
      return doc ? { referencePanel: doc, direction: "left" } : { direction: "left" };
    case "mapLayers":
      // 레이어(E3)는 인스펙터 아래
      if (has("inspector")) return { referencePanel: "inspector", direction: "below" };
      return doc ? { referencePanel: doc, direction: "right" } : { direction: "right" };
  }
}

// ---- 맵 패널 (맵 탭이 활성이 될 때) ----

/** 맵 탭이 활성이 되면 없을 때 더하는 패널. 이 순서로 더한다 */
export const MAP_PANEL_IDS = ["mapObjects", "mapPalette", "mapLayers"] as const satisfies readonly PanelId[];

/** 더할 맵 패널: 레이아웃에 없고, 이 세션에서 사용자가 닫지 않은 것 */
export function missingMapPanels(isOpen: (id: PanelId) => boolean, userClosed: ReadonlySet<string>): PanelId[] {
  return MAP_PANEL_IDS.filter((id) => !isOpen(id) && !userClosed.has(id));
}

/**
 * 맵 패널의 자리. 맵 오브젝트는 계층 옆 탭, 팔레트는 왼쪽 아래(프로젝트 아래, 없으면 계층 아래),
 * 레이어는 오른쪽(인스펙터 아래, 없으면 문서 오른쪽). 기댈 패널이 없으면 문서 옆, 문서도 없으면 가장자리.
 */
export function mapPanelPlacement(has: (id: string) => boolean, id: PanelId, docPanel: string | undefined): Placement {
  const nextToDoc = (direction: Direction): Placement => (docPanel ? { referencePanel: docPanel, direction } : { direction });
  switch (id) {
    case "mapObjects":
      if (has("hierarchy")) return { referencePanel: "hierarchy", direction: "within" };
      if (has("project")) return { referencePanel: "project", direction: "within" };
      return nextToDoc("left");
    case "mapPalette":
      if (has("project")) return { referencePanel: "project", direction: "below" };
      if (has("hierarchy")) return { referencePanel: "hierarchy", direction: "below" };
      if (has("mapObjects")) return { referencePanel: "mapObjects", direction: "below" };
      return nextToDoc("left");
    case "mapLayers":
      if (has("inspector")) return { referencePanel: "inspector", direction: "below" };
      if (has("extensions")) return { referencePanel: "extensions", direction: "below" };
      return nextToDoc("right");
    default:
      return nextToDoc("right");
  }
}

/** 새로 더한 맵 패널의 높이 (자기 그룹을 새로 만든 것만) */
export const MAP_PANEL_HEIGHTS: Partial<Record<PanelId, number>> = { mapPalette: 260, mapLayers: 220 };

function size(api: DockviewApi, id: string, dim: { width?: number; height?: number }): void {
  api.getPanel(id)?.api.setSize(dim);
}

/**
 * 프리셋을 짓는다. 문서 그룹은 여기서 만들지 않는다: DocumentDock.reconcile 이 열린 문서를
 * 콘솔 위(가운데)에 놓는다. 크기는 문서 그룹이 생긴 뒤 applyPresetSizes 로 맞춘다.
 */
export function buildPreset(api: DockviewApi, name: PresetName): void {
  api.clear();
  const add = (id: PanelId, placement?: Placement) => addToolPanel(api, id, placement ?? { direction: "right" });
  switch (name) {
    case "scene":
      add("hierarchy");
      add("inspector", { referencePanel: "hierarchy", direction: "right" });
      add("console", { referencePanel: "hierarchy", direction: "right" });
      add("project", { referencePanel: "hierarchy", direction: "below" });
      add("extensions", { referencePanel: "inspector", direction: "below" });
      break;
    case "script":
      // 편집기와 콘솔이 넓고 계층과 인스펙터는 접힌다
      add("project");
      add("console", { referencePanel: "project", direction: "right" });
      break;
    case "tilemap":
      // 왼쪽: 위는 계층, 프로젝트, 맵 오브젝트 탭이고 아래는 팔레트. 가운데: 맵 뷰와 콘솔. 오른쪽: 인스펙터와 레이어
      add("hierarchy");
      add("inspector", { referencePanel: "hierarchy", direction: "right" });
      add("console", { referencePanel: "hierarchy", direction: "right" });
      add("mapPalette", { referencePanel: "hierarchy", direction: "below" });
      add("project", { referencePanel: "hierarchy", direction: "within" });
      add("mapObjects", { referencePanel: "hierarchy", direction: "within" });
      add("mapLayers", { referencePanel: "inspector", direction: "below" });
      break;
  }
}

/** 문서 그룹이 놓인 뒤 부르는 크기 조정 */
export function applyPresetSizes(api: DockviewApi, name: PresetName): void {
  switch (name) {
    case "scene":
      size(api, "hierarchy", { width: 260 });
      size(api, "inspector", { width: 280 });
      size(api, "hierarchy", { height: 260 });
      size(api, "console", { height: 200 });
      break;
    case "script":
      size(api, "project", { width: 240 });
      size(api, "console", { height: 260 });
      break;
    case "tilemap":
      size(api, "hierarchy", { width: 300 });
      size(api, "hierarchy", { height: 240 });
      size(api, "inspector", { width: 280 });
      size(api, "mapLayers", { height: 240 });
      size(api, "console", { height: 150 });
      break;
  }
}
