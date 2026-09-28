// 스크립트 관련 커맨드와 메뉴 (E1). appCommands.ts 는 edit.find 를 비워 두고 여기가 등록한다.
//   edit.find (Ctrl+F): 스크립트 탭이 활성이면 Monaco 의 찾기, 아니면 프로젝트 찾기 패널
//   edit.findInProject (Ctrl+Shift+F): 프로젝트 찾기 패널을 열고 입력 칸에 초점 (선택한 글자가 있으면 그것으로)
//   file.newScript (Ctrl+Alt+N): 새 스크립트 대화상자
//   edit.undo, edit.redo: 스크립트 탭이 활성이면 Monaco 의 스택으로 (appCommands 의 것을 감싼다)
// Monaco 안에서 누른 키는 Monaco 가 먼저 받으므로 같은 단축키를 편집기 액션으로도 건다 (ScriptEditorView).

import type { EditorCommand } from "@initial-editor/core";
import type { Editor } from "../Editor";
import { isEditableTarget } from "../shortcuts";
import { openNewScriptDialog } from "./NewScriptDialog";
import type { ScriptSupport } from "./ScriptSupport";

export const FIND_PANEL_ID = "find";
const NEED_PROJECT = "열린 프로젝트 없음";

/** 찾기 패널을 열고(없으면 켜고) 입력 칸에 초점을 준다 */
export function openFindPanel(editor: Editor, support: ScriptSupport, query = ""): void {
  const api = editor.layout.api;
  if (api) {
    const panel = api.getPanel(FIND_PANEL_ID);
    if (!panel) editor.layout.togglePanel(FIND_PANEL_ID);
    else panel.api.setActive();
  }
  support.find.requestFocus(query);
}

/** 초점이 Monaco 밖의 입력 칸에 있는가. 그러면 되돌리기는 그 칸의 몫이다 */
function focusInPlainInput(): boolean {
  const el = document.activeElement;
  if (!el || el.closest(".monaco-editor")) return false;
  return isEditableTarget(el);
}

export function registerScriptCommands(editor: Editor, support: ScriptSupport): () => void {
  const c = editor.commands;
  const disposers: Array<() => void> = [];
  const reg = (cmd: EditorCommand) => disposers.push(c.register(cmd));

  reg({
    id: "edit.find",
    label: "찾기",
    category: "edit",
    shortcut: "Ctrl+F",
    run: () => {
      const script = support.activeScript;
      if (script?.hasEditor) {
        script.focus();
        script.runAction("actions.find");
        return;
      }
      openFindPanel(editor, support);
    },
  });
  reg({
    id: "edit.findInProject",
    label: "프로젝트에서 찾기",
    category: "edit",
    shortcut: "Ctrl+Shift+F",
    enabled: () => editor.project.isOpen,
    run: () => openFindPanel(editor, support, support.activeScript?.selectedText().split("\n")[0] ?? ""),
  });
  editor.setHint("edit.findInProject", () => (editor.project.isOpen ? undefined : NEED_PROJECT));
  reg({
    id: "file.newScript",
    label: "새 스크립트",
    category: "file",
    shortcut: "Ctrl+Alt+N",
    enabled: () => editor.project.isOpen,
    run: () => openNewScriptDialog(editor),
  });
  editor.setHint("file.newScript", () => (editor.project.isOpen ? undefined : NEED_PROJECT));

  for (const [id, handler] of [
    ["edit.undo", "undo"],
    ["edit.redo", "redo"],
  ] as const) {
    const base = c.get(id);
    if (!base) continue;
    c.unregister(id);
    reg({
      ...base,
      enabled: () => {
        if (support.activeScript?.hasEditor && !focusInPlainInput()) return true;
        return base.enabled ? base.enabled() : true;
      },
      run: () => {
        const script = support.activeScript;
        if (script?.hasEditor && !focusInPlainInput()) {
          script.focus();
          script.trigger(handler);
          return;
        }
        return base.run();
      },
    });
  }

  disposers.push(editor.menus.register({ path: "파일/새 스크립트", commandId: "file.newScript", order: 35, separatorBefore: true }));
  disposers.push(editor.menus.register({ path: "편집/프로젝트에서 찾기", commandId: "edit.findInProject", order: 81 }));

  return () => {
    for (const d of disposers.reverse()) d();
  };
}
