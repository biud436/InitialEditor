// 도킹 프리셋 셋 (02-scope-and-screens.md 3절 "레이아웃"). 씬(기본), 스크립트, 타일맵.
// JSON 을 손으로 적지 않고 addPanel 의 상대 위치로 짓는다. dockview 의 직렬화 모양이 바뀌어도 살아남게.

import type { AddPanelOptions, DockviewApi } from "dockview";

export const PANEL_IDS = ["hierarchy", "project", "inspector", "extensions", "console"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  hierarchy: "계층",
  project: "프로젝트",
  inspector: "인스펙터",
  extensions: "확장 패널",
  console: "콘솔",
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

function firstDocPanelId(api: DockviewApi): string | undefined {
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
  }
}

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
      // 팔레트와 레이어(확장 패널)가 크고 씬 뷰가 넓다
      add("hierarchy");
      add("extensions", { referencePanel: "hierarchy", direction: "right" });
      add("console", { referencePanel: "hierarchy", direction: "right" });
      add("project", { referencePanel: "hierarchy", direction: "below" });
      add("inspector", { referencePanel: "extensions", direction: "above" });
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
      size(api, "hierarchy", { width: 220 });
      size(api, "hierarchy", { height: 160 });
      size(api, "extensions", { width: 340 });
      size(api, "inspector", { height: 180 });
      size(api, "console", { height: 150 });
      break;
  }
}
