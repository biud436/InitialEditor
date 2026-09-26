// 전역 단축키. 키 이벤트를 커맨드 레지스트리(commands.findByKey)로 보낸다.
// 입력 칸(input, textarea, contenteditable)에 초점이 있으면 file.* 와 되돌리기와 다시 실행만 허용한다.
// 그래야 텍스트 칸의 복사와 붙여넣기와 찾기가 브라우저 기본대로 돈다.

import type { CommandRegistry, KeyLike } from "@initial-editor/core";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (EDITABLE_TAGS.has(el.tagName)) return true;
  return el.isContentEditable === true;
}

/** 입력 칸 안에서도 통하는 커맨드인가 */
export function allowedInEditable(commandId: string): boolean {
  return commandId.startsWith("file.") || commandId === "edit.undo" || commandId === "edit.redo";
}

/** 키에 맞는 활성 커맨드 id. 입력 칸이면 allowedInEditable 로 거른다. 없으면 null */
export function resolveShortcut(commands: CommandRegistry, ev: KeyLike, inEditable: boolean): string | null {
  const id = commands.findByKey(ev);
  if (!id) return null;
  if (inEditable && !allowedInEditable(id)) return null;
  return id;
}

/** window 에 keydown 을 걸고 커맨드를 실행한다. 돌려주는 함수로 뗀다 */
export function installShortcuts(commands: CommandRegistry, win: Window = window): () => void {
  const handler = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented || ev.isComposing) return;
    const id = resolveShortcut(commands, ev, isEditableTarget(ev.target));
    if (!id) return;
    ev.preventDefault();
    ev.stopPropagation();
    void commands.execute(id);
  };
  win.addEventListener("keydown", handler);
  return () => win.removeEventListener("keydown", handler);
}
