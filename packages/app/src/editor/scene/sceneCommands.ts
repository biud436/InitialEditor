// 씬 커맨드와 메뉴 (docs/plans/02-scope-and-screens.md 5절의 씬 갈래와 편집 갈래).
//   scene.new (Ctrl+Shift+N), scene.addObject (Ctrl+Shift+A, 목록 대화상자), scene.add.<타입> (씬/오브젝트 추가/<라벨>,
//   레지스트리가 바뀌면 다시 등록), scene.setStart (활성 씬을 game.json 의 startScene 으로, 이미 그것이면 체크),
//   edit.cut, edit.copy, edit.paste, edit.duplicate (Ctrl+D), edit.delete (Delete): 씬 탭이면 씬 오브젝트, 맵 탭이면 맵 오브젝트.
// 입력 칸과 Monaco 안에서 누른 Ctrl+C 같은 것은 shortcuts.ts 가 여기로 보내지 않아 브라우저 기본대로 돈다.

import { Disposables, type EditorCommand } from "@initial-editor/core";
import { reaction } from "mobx";
import type { Editor } from "../Editor";
import { mapEditRouter, type EditAction } from "../maps/mapClipboard";
import { openAddObjectDialog } from "./AddObjectDialog";
import type { SceneTools } from "./SceneTools";

export const ADD_MENU_PATH = "씬/오브젝트 추가";
const NEED_SCENE = "활성 씬 탭 없음";
const NEED_SELECTION = "선택한 오브젝트 없음 (계층 패널이나 씬 뷰에서 선택)";
const NEED_PROJECT = "열린 프로젝트 없음";

export function registerSceneCommands(editor: Editor, tools: SceneTools): () => void {
  const c = editor.commands;
  const disposers: Array<() => void> = [];
  const reg = (cmd: EditorCommand) => disposers.push(c.register(cmd));
  const hasScene = () => tools.activeScene !== null;
  const hasSelection = () => (tools.activeScene?.selectedIds.length ?? 0) > 0;
  const sceneHint = () => (editor.project.isOpen ? (hasScene() ? undefined : NEED_SCENE) : NEED_PROJECT);
  const selectionHint = () => sceneHint() ?? (hasSelection() ? undefined : NEED_SELECTION);

  reg({ id: "scene.new", label: "새 씬", category: "scene", shortcut: "Ctrl+Shift+N", enabled: () => editor.project.isOpen, run: () => void tools.newScene() });
  editor.setHint("scene.new", () => (editor.project.isOpen ? undefined : NEED_PROJECT));

  reg({ id: "scene.addObject", label: "목록에서 선택", category: "scene", shortcut: "Ctrl+Shift+A", enabled: hasScene, run: () => openAddObjectDialog(editor) });
  editor.setHint("scene.addObject", sceneHint);

  reg({ id: "scene.setStart", label: "시작 씬으로 지정", category: "scene", enabled: hasScene, run: () => void tools.setStartScene() });
  editor.setHint("scene.setStart", sceneHint);
  editor.setChecked("scene.setStart", () => tools.isStartScene());

  // 편집 커맨드는 활성 문서의 종류로 가른다: 그래프면 노드(graph/GraphSupport.ts), 맵이면 맵 오브젝트(maps/mapClipboard.ts), 아니면 씬 오브젝트
  const graphs = editor.graphSupport?.router;
  const mapRouter = mapEditRouter(editor, () => editor.mapSupport?.clipboard ?? null);
  const maps = graphs
    ? {
        active: () => graphs.active() || mapRouter.active(),
        enabled: (a: EditAction) => (graphs.active() ? graphs.enabled(a) : mapRouter.enabled(a)),
        run: (a: EditAction) => (graphs.active() ? graphs.run(a) : mapRouter.run(a)),
        hint: (a: EditAction) => (graphs.active() ? graphs.hint(a) : mapRouter.hint(a)),
      }
    : mapRouter;
  const edit = (spec: { id: string; label: string; shortcut: string; action: EditAction; enabled: () => boolean; hint: () => string | undefined; run: () => void }) => {
    reg({
      id: spec.id,
      label: spec.label,
      category: "edit",
      shortcut: spec.shortcut,
      enabled: () => (maps.active() ? maps.enabled(spec.action) : spec.enabled()),
      run: () => (maps.active() ? maps.run(spec.action) : spec.run()),
    });
    editor.setHint(spec.id, () => (maps.active() ? maps.hint(spec.action) : spec.hint()));
  };

  edit({
    id: "edit.copy",
    label: "복사",
    shortcut: "Ctrl+C",
    action: "copy",
    enabled: hasSelection,
    hint: selectionHint,
    run: () => {
      const n = tools.copy();
      if (n > 0) editor.toasts.info(`오브젝트 ${n}개 복사됨`);
    },
  });
  edit({ id: "edit.cut", label: "잘라내기", shortcut: "Ctrl+X", action: "cut", enabled: hasSelection, hint: selectionHint, run: () => void tools.cut() });
  edit({
    id: "edit.paste",
    label: "붙여넣기",
    shortcut: "Ctrl+V",
    action: "paste",
    enabled: () => hasScene() && tools.clipboard.length > 0,
    hint: () => sceneHint() ?? (tools.clipboard.length > 0 ? undefined : "복사한 오브젝트 없음"),
    run: () => void tools.paste(),
  });
  edit({ id: "edit.duplicate", label: "복제", shortcut: "Ctrl+D", action: "duplicate", enabled: hasSelection, hint: selectionHint, run: () => void tools.duplicateSelected() });
  edit({ id: "edit.delete", label: "삭제", shortcut: "Delete", action: "delete", enabled: hasSelection, hint: selectionHint, run: () => void tools.deleteSelected() });

  // 씬/오브젝트 추가/<타입>: 레지스트리가 바뀔 때마다 다시 등록한다 (recentProjects.ts 와 같은 방식)
  let typeItems = new Disposables();
  const rebuild = (types: Array<{ type: string; label: string }>) => {
    typeItems.dispose();
    typeItems = new Disposables();
    types.forEach((t, i) => {
      const id = `scene.add.${t.type}`;
      typeItems.add(c.register({ id, label: t.label, category: "scene", enabled: hasScene, run: () => void tools.addObject(t.type) }));
      editor.setHint(id, sceneHint);
      typeItems.add(editor.menus.register({ path: `${ADD_MENU_PATH}/${t.label}`, commandId: id, order: 10 + i }));
    });
  };
  disposers.push(
    reaction(
      () => tools.objectTypes().map((t) => ({ type: t.type, label: t.label })),
      (types) => rebuild(types),
      { fireImmediately: true, equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    ),
  );
  disposers.push(() => typeItems.dispose());

  return () => {
    for (const d of disposers.reverse()) d();
  };
}
