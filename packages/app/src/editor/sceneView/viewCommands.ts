// 씬 뷰의 보기 커맨드 (E2). appCommands.ts 는 씬 자리를 비워 두고 여기가 등록한다.
//   scene.toggleGrid, scene.toggleSnap: 보기 설정 토글 (체크 표시). 씬 메뉴의 항목은 appMenus.ts 에 이미 있다
//   scene.zoomIn (Ctrl+=), scene.zoomOut (Ctrl+-), scene.zoomReset (Ctrl+0), scene.fitCamera: 씬 탭이 활성일 때
// 되돌리기와 다시 실행은 appCommands 의 것이 활성 문서의 UndoStack 을 쓰므로 씬 탭에서 그대로 통한다.

import type { EditorCommand } from "@initial-editor/core";
import type { Editor } from "../Editor";
import type { SceneSupport } from "./SceneSupport";

const NEED_SCENE = "활성 씬 탭 없음";

export function registerViewCommands(editor: Editor, support: SceneSupport): () => void {
  const c = editor.commands;
  const disposers: Array<() => void> = [];
  const reg = (cmd: EditorCommand) => disposers.push(c.register(cmd));
  const view = support.view;
  const hasScene = () => support.activeScene !== null;

  reg({ id: "scene.toggleGrid", label: "격자 표시", category: "scene", run: () => view.toggleGrid() });
  editor.setChecked("scene.toggleGrid", () => view.grid);
  reg({ id: "scene.toggleSnap", label: "스냅", category: "scene", run: () => view.toggleSnap() });
  editor.setChecked("scene.toggleSnap", () => view.snap);

  reg({ id: "scene.zoomIn", label: "줌 확대", category: "scene", shortcut: "Ctrl+=", enabled: hasScene, run: () => view.zoomIn() });
  reg({ id: "scene.zoomOut", label: "줌 축소", category: "scene", shortcut: "Ctrl+-", enabled: hasScene, run: () => view.zoomOut() });
  reg({ id: "scene.zoomReset", label: "줌 100%", category: "scene", shortcut: "Ctrl+0", enabled: hasScene, run: () => view.resetZoom() });
  reg({
    id: "scene.fitCamera",
    label: "카메라에 맞추기",
    category: "scene",
    enabled: () => support.rendererFor(support.activeScene) !== null,
    run: () => support.rendererFor(support.activeScene)?.fitCamera(),
  });
  for (const id of ["scene.zoomIn", "scene.zoomOut", "scene.zoomReset", "scene.fitCamera"]) {
    editor.setHint(id, () => (hasScene() ? undefined : NEED_SCENE));
  }

  disposers.push(
    editor.menus.register({ path: "씬/줌 확대", commandId: "scene.zoomIn", order: 60, separatorBefore: true }),
    editor.menus.register({ path: "씬/줌 축소", commandId: "scene.zoomOut", order: 70 }),
    editor.menus.register({ path: "씬/줌 100%", commandId: "scene.zoomReset", order: 80 }),
    editor.menus.register({ path: "씬/카메라에 맞추기", commandId: "scene.fitCamera", order: 90 }),
  );

  return () => {
    for (const d of disposers.reverse()) d();
  };
}
