// 맵 커맨드와 "맵" 메뉴 (씬 30과 실행 40 사이, 35).
//   map.new (Ctrl+Alt+M): 새 맵 대화상자 (newMap.ts, components/maps/NewMapDialog.tsx). 프로젝트가 열려 있을 때
//   map.resize: 크기 바꾸기 대화상자 (resize.ts, components/maps/ResizeMapDialog.tsx). 맵 탭이 활성일 때
//   map.tool.<도구>: 펜 B, 사각형 R, 채우기 G, 지우개 E, 스포이드 I, 통행 C, 오브젝트 V.
//     맵 탭이 활성이고 초점이 입력 칸에 없고 타일을 고르는 중이 아닐 때만 켜진다 (MapSupport.toolKeysOff)
//   map.layer.<id>: 확장 레이어를 대상으로 (단축키는 레이어의 toolKey). extLayers.ts 가 등록한다
//   map.toggleGrid, map.toggleCollision, map.toggleObjects, map.toggleDimAbove: 보기 토글 (체크 표시)
//   map.zoomIn (Ctrl+=), map.zoomOut (Ctrl+-), map.zoomReset (Ctrl+0), map.fit: 맵 탭이 활성일 때.
//     씬의 줌 커맨드와 단축키가 같지만 둘은 활성 조건이 겹치지 않아 활성인 쪽이 받는다

import type { EditorCommand } from "@initial-editor/core";
import type { MapDocument, MapTool } from "@initial-editor/ext-tilemap/model";
import { runInAction } from "mobx";
import { openNewMapDialog } from "../../components/maps/NewMapDialog";
import { openResizeMapDialog } from "../../components/maps/ResizeMapDialog";
import type { Editor } from "../Editor";
import type { MapSupport } from "./MapSupport";
import { createMapFile } from "./newMap";
import { applyResize } from "./resize";

export interface ToolSpec {
  tool: MapTool;
  label: string;
  key: string;
  title: string;
}

export const MAP_TOOLS: readonly ToolSpec[] = [
  { tool: "pen", label: "펜", key: "B", title: "붓을 찍는다. 끌면 선을 따라 찍는다" },
  { tool: "rect", label: "사각형", key: "R", title: "사각형을 끌어 붓 무늬로 채운다" },
  { tool: "fill", label: "채우기", key: "G", title: "이어진 같은 칸을 붓 무늬로 채운다" },
  { tool: "erase", label: "지우개", key: "E", title: "칸을 비운다 (통행이 대상이면 지나감으로)" },
  { tool: "pick", label: "스포이드", key: "I", title: "맵에서 칸이나 사각형을 떠서 붓으로 쓴다" },
  { tool: "collision", label: "통행", key: "C", title: "통행을 칠한다. 왼쪽은 막힘, 오른쪽이나 Alt는 지나감" },
  { tool: "object", label: "오브젝트", key: "V", title: "오브젝트를 고르고 옮긴다. 범위 손잡이와 띠 가장자리도 끈다" },
];

const TILE_TOOLS: ReadonlySet<MapTool> = new Set(["pen", "rect", "fill", "erase", "pick"]);
const NEED_MAP = "맵 탭이 활성일 때";
const NEED_PROJECT = "프로젝트를 먼저 연다";

/**
 * 도구를 고른다. 대상이 오브젝트나 확장 레이어이면 타일 도구는 마지막 타일 레이어로 돌아간다. 대상이 통행이면 펜과 스포이드는
 * 타일 레이어로 돌아가고, 사각형과 채우기와 지우개는 통행을 칠한다.
 */
export function selectMapTool(support: MapSupport, doc: MapDocument, tool: MapTool): void {
  if (TILE_TOOLS.has(tool)) {
    const t = doc.target.kind;
    if (t === "objects" || t === "ext" || (t === "collision" && (tool === "pen" || tool === "pick"))) doc.setTarget({ kind: "layer", index: support.lastLayer(doc) });
  }
  doc.setTool(tool);
}

export function registerMapCommands(editor: Editor, support: MapSupport): () => void {
  const c = editor.commands;
  const disposers: Array<() => void> = [];
  const reg = (cmd: EditorCommand) => disposers.push(c.register(cmd));
  const hasMap = () => support.activeMap !== null;
  const withMap = (fn: (doc: MapDocument) => void) => () => {
    const doc = support.activeMap;
    if (doc) fn(doc);
  };
  const renderer = () => support.rendererFor(support.activeMap);

  editor.menus.setBranchOrder("맵", 35);

  reg({
    id: "map.new",
    label: "새 맵",
    category: "map",
    shortcut: "Ctrl+Alt+M",
    enabled: () => editor.project.isOpen,
    run: async () => {
      const spec = await openNewMapDialog(editor);
      if (!spec) return;
      const path = await createMapFile(editor, spec);
      if (path) await support.openMap(path);
    },
  });
  editor.setHint("map.new", () => (editor.project.isOpen ? undefined : NEED_PROJECT));
  reg({
    id: "map.resize",
    label: "크기 바꾸기",
    category: "map",
    enabled: hasMap,
    run: async () => {
      const doc = support.activeMap;
      if (!doc) return;
      const req = await openResizeMapDialog(editor, doc);
      if (req) applyResize(editor, doc, req);
    },
  });
  editor.setHint("map.resize", () => (hasMap() ? undefined : NEED_MAP));
  disposers.push(
    editor.menus.register({ path: "맵/새 맵", commandId: "map.new", order: 1 }),
    editor.menus.register({ path: "맵/크기 바꾸기", commandId: "map.resize", order: 2 }),
  );

  MAP_TOOLS.forEach((spec, i) => {
    const id = `map.tool.${spec.tool}`;
    reg({
      id,
      label: spec.label,
      category: "map",
      shortcut: spec.key,
      enabled: () => hasMap() && !support.toolKeysOff,
      run: withMap((doc) => selectMapTool(support, doc, spec.tool)),
    });
    editor.setChecked(id, () => support.activeMap?.tool === spec.tool);
    editor.setHint(id, () => (hasMap() ? undefined : NEED_MAP));
    disposers.push(editor.menus.register({ path: `맵/${spec.label} 도구`, commandId: id, order: 10 + i, separatorBefore: i === 0 }));
  });

  reg({ id: "map.toggleGrid", label: "격자 표시", category: "map", run: () => support.view.toggleGrid() });
  editor.setChecked("map.toggleGrid", () => support.view.grid);
  reg({
    id: "map.toggleCollision",
    label: "통행 보기",
    category: "map",
    enabled: hasMap,
    run: withMap((doc) => runInAction(() => (doc.showCollision = !doc.showCollision))),
  });
  editor.setChecked("map.toggleCollision", () => support.activeMap?.showCollision ?? false);
  reg({
    id: "map.toggleObjects",
    label: "오브젝트 보기",
    category: "map",
    enabled: hasMap,
    run: withMap((doc) => runInAction(() => (doc.showObjects = !doc.showObjects))),
  });
  editor.setChecked("map.toggleObjects", () => support.activeMap?.showObjects ?? false);
  reg({ id: "map.toggleDimAbove", label: "위 레이어 흐리게", category: "map", run: () => support.view.toggleDimAbove() });
  editor.setChecked("map.toggleDimAbove", () => support.view.dimAbove);

  reg({ id: "map.zoomIn", label: "줌 확대", category: "map", shortcut: "Ctrl+=", enabled: () => renderer() !== null, run: () => renderer()?.zoomIn() });
  reg({ id: "map.zoomOut", label: "줌 축소", category: "map", shortcut: "Ctrl+-", enabled: () => renderer() !== null, run: () => renderer()?.zoomOut() });
  reg({ id: "map.zoomReset", label: "줌 100%", category: "map", shortcut: "Ctrl+0", enabled: () => renderer() !== null, run: () => renderer()?.resetZoom() });
  reg({ id: "map.fit", label: "맵 전체 보기", category: "map", enabled: () => renderer() !== null, run: () => renderer()?.fit() });
  for (const id of ["map.toggleCollision", "map.toggleObjects", "map.zoomIn", "map.zoomOut", "map.zoomReset", "map.fit"]) {
    editor.setHint(id, () => (hasMap() ? undefined : NEED_MAP));
  }

  disposers.push(
    editor.menus.register({ path: "맵/격자 표시", commandId: "map.toggleGrid", order: 100, separatorBefore: true }),
    editor.menus.register({ path: "맵/통행 보기", commandId: "map.toggleCollision", order: 110 }),
    editor.menus.register({ path: "맵/오브젝트 보기", commandId: "map.toggleObjects", order: 120 }),
    editor.menus.register({ path: "맵/위 레이어 흐리게", commandId: "map.toggleDimAbove", order: 130 }),
    editor.menus.register({ path: "맵/줌 확대", commandId: "map.zoomIn", order: 200, separatorBefore: true }),
    editor.menus.register({ path: "맵/줌 축소", commandId: "map.zoomOut", order: 210 }),
    editor.menus.register({ path: "맵/줌 100%", commandId: "map.zoomReset", order: 220 }),
    editor.menus.register({ path: "맵/맵 전체 보기", commandId: "map.fit", order: 230 }),
  );

  return () => {
    for (const d of disposers.reverse()) d();
  };
}
