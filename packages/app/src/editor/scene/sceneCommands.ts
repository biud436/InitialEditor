// 씬 커맨드와 메뉴 (docs/plans/02-scope-and-screens.md 5절의 씬 갈래와 편집 갈래).
//   scene.new (Ctrl+Shift+N), scene.addObject (Ctrl+Shift+A, 목록 대화상자), scene.add.<타입> (씬/오브젝트 추가/<라벨>,
//   레지스트리가 바뀌면 다시 등록), scene.setStart (활성 씬을 game.json 의 startScene 으로, 이미 그것이면 체크),
//   edit.cut, edit.copy, edit.paste, edit.duplicate (Ctrl+D), edit.delete (Delete): 씬 탭이 활성일 때만.
// 입력 칸과 Monaco 안에서 누른 Ctrl+C 같은 것은 shortcuts.ts 가 여기로 보내지 않아 브라우저 기본대로 돈다.

import { Disposables, type EditorCommand } from "@initial-editor/core";
import { reaction } from "mobx";
import type { Editor } from "../Editor";
import { openAddObjectDialog } from "./AddObjectDialog";
import type { SceneTools } from "./SceneTools";

export const ADD_MENU_PATH = "씬/오브젝트 추가";
const NEED_SCENE = "씬 탭이 활성일 때 쓸 수 있다";
const NEED_SELECTION = "계층이나 씬 뷰에서 오브젝트를 고른다";
const NEED_PROJECT = "프로젝트를 먼저 연다";

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

  reg({ id: "scene.addObject", label: "목록에서 고르기", category: "scene", shortcut: "Ctrl+Shift+A", enabled: hasScene, run: () => openAddObjectDialog(editor) });
  editor.setHint("scene.addObject", sceneHint);

  reg({ id: "scene.setStart", label: "시작 씬으로 지정", category: "scene", enabled: hasScene, run: () => void tools.setStartScene() });
  editor.setHint("scene.setStart", sceneHint);
  editor.setChecked("scene.setStart", () => tools.isStartScene());

  reg({
    id: "edit.copy",
    label: "복사",
    category: "edit",
    shortcut: "Ctrl+C",
    enabled: hasSelection,
    run: () => {
      const n = tools.copy();
      if (n > 0) editor.toasts.info(`오브젝트 ${n}개를 복사했다`);
    },
  });
  editor.setHint("edit.copy", selectionHint);
  reg({
    id: "edit.cut",
    label: "잘라내기",
    category: "edit",
    shortcut: "Ctrl+X",
    enabled: hasSelection,
    run: () => {
      tools.cut();
    },
  });
  editor.setHint("edit.cut", selectionHint);
  reg({
    id: "edit.paste",
    label: "붙여넣기",
    category: "edit",
    shortcut: "Ctrl+V",
    enabled: () => hasScene() && tools.clipboard.length > 0,
    run: () => {
      tools.paste();
    },
  });
  editor.setHint("edit.paste", () => sceneHint() ?? (tools.clipboard.length > 0 ? undefined : "복사한 오브젝트가 없다"));
  reg({
    id: "edit.duplicate",
    label: "복제",
    category: "edit",
    shortcut: "Ctrl+D",
    enabled: hasSelection,
    run: () => {
      tools.duplicateSelected();
    },
  });
  editor.setHint("edit.duplicate", selectionHint);
  reg({
    id: "edit.delete",
    label: "삭제",
    category: "edit",
    shortcut: "Delete",
    enabled: hasSelection,
    run: () => {
      tools.deleteSelected();
    },
  });
  editor.setHint("edit.delete", selectionHint);

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
