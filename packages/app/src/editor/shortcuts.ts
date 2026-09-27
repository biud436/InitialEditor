// 전역 단축키. 키 이벤트를 커맨드 레지스트리(commands.findByKey)로 보낸다.
// 입력 칸(input, textarea, contenteditable, 스크립트 편집기)에 초점이 있으면 file.*, run.*, 새로 고침 계열과 되돌리기와
// 다시 실행만 허용한다. 그래야 텍스트 칸의 복사와 붙여넣기와 찾기가 브라우저 기본대로 돈다.
// 새로 고침 계열(F5와 그 조합, Ctrl+R과 Ctrl+Shift+R, mac은 Cmd)은 커맨드에 묶여 있으면 커맨드가 비활성이어도
// 기본 동작(페이지 새로 고침)을 막는다. IME 조합 중에는 새로 고침 계열만 받는다 (조합에 들어가는 키가 아니다).
// 모달 대화상자가 떠 있으면 커맨드를 부르지 않는다 (대화상자가 자기 키를 다룬다). 그때도 묶인 새로 고침 계열은 막는다.

import { matchShortcut, type CommandRegistry, type KeyLike, type Platform, type ProjectBackend } from "@initial-editor/core";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (EDITABLE_TAGS.has(el.tagName)) return true;
  return el.isContentEditable === true;
}

/**
 * 브라우저에서 페이지를 새로 고치는 키: F5(Shift, Ctrl, Alt와 함께도), Ctrl+R과 Ctrl+Shift+R(mac은 Cmd).
 * 글자를 넣지 않으므로 입력 칸 안에서도, IME 조합 중에도 에디터가 받는다
 */
export function isReloadKey(ev: KeyLike, platform: Platform): boolean {
  if (ev.key === "F5") return true;
  const primary = platform === "mac" ? ev.metaKey : ev.ctrlKey;
  return primary && !ev.altKey && ev.key.toLowerCase() === "r";
}

/** 입력 칸 안에서도 통하는 커맨드인가 */
export function allowedInEditable(commandId: string): boolean {
  return commandId.startsWith("file.") || commandId.startsWith("run.") || commandId === "edit.undo" || commandId === "edit.redo";
}

/** 키에 맞는 활성 커맨드 id. 입력 칸이면 allowedInEditable과 새로 고침 계열만 통한다. 없으면 null */
export function resolveShortcut(commands: CommandRegistry, ev: KeyLike, inEditable: boolean): string | null {
  const id = commands.findByKey(ev);
  if (!id) return null;
  if (inEditable && !allowedInEditable(id) && !isReloadKey(ev, commands.context.platform)) return null;
  return id;
}

/** 키에 묶인 커맨드가 있는가 (비활성이어도) */
export function isBoundKey(commands: CommandRegistry, ev: KeyLike): boolean {
  return commands.list().some((cmd) => !!cmd.shortcut && matchShortcut(cmd.shortcut, ev, commands.context.platform));
}

/** 커맨드에 묶인 새로 고침 계열 키인가. 커맨드가 비활성이어도 페이지를 새로 고치지 않게 막는다 */
export function isBoundReloadKey(commands: CommandRegistry, ev: KeyLike): boolean {
  return isReloadKey(ev, commands.context.platform) && isBoundKey(commands, ev);
}

export interface ShortcutOptions {
  /** true 면 커맨드를 부르지 않는다 (모달 대화상자가 떠 있다) */
  suspended?: () => boolean;
}

/** window 에 keydown 을 걸고 커맨드를 실행한다. 돌려주는 함수로 뗀다 */
export function installShortcuts(commands: CommandRegistry, win: Window = window, opts: ShortcutOptions = {}): () => void {
  const handler = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented) return;
    if (ev.isComposing && !isReloadKey(ev, commands.context.platform)) return;
    if (opts.suspended?.()) {
      if (isBoundReloadKey(commands, ev)) ev.preventDefault();
      return;
    }
    const id = resolveShortcut(commands, ev, isEditableTarget(ev.target));
    if (!id) {
      // 비활성인 커맨드에 묶인 새로 고침 계열 키가 페이지를 새로 고치지 않게
      if (isBoundReloadKey(commands, ev)) ev.preventDefault();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    void commands.execute(id);
  };
  win.addEventListener("keydown", handler);
  return () => win.removeEventListener("keydown", handler);
}

/**
 * 페이지를 떠나면 잃는 것이 있는가: 저장하지 않은 문서, 또는 메모리 백엔드(메모리 모드, 웹판의 샘플)에 이번 세션에
 * 저장한 것 (그 파일은 이 페이지의 메모리에만 있다. ProjectBackend.volatileWrites)
 */
export function losesWorkOnUnload(dirtyDocuments: number, backend: Pick<ProjectBackend, "volatileWrites">): boolean {
  return dirtyDocuments > 0 || (backend.volatileWrites ?? 0) > 0;
}

/**
 * 잃는 것이 있으면(losesWorkOnUnload) 페이지를 떠나기 전에 묻는다 (브라우저가 띄우는 확인 창).
 * 브라우저 모드에만 건다. Tauri 창은 페이지를 새로 고치지 않고 창 닫기 확인은 이 앱에 따로 없다 (두 번 묻지 않게).
 */
export function installUnloadGuard(hasUnsaved: () => boolean, win: Pick<Window, "addEventListener" | "removeEventListener"> = window): () => void {
  const handler = (ev: Event) => {
    if (!hasUnsaved()) return;
    ev.preventDefault();
    // 크로미움 119 전과 사파리는 returnValue 가 빈 글이 아니어야 묻는다
    (ev as BeforeUnloadEvent).returnValue = "페이지를 떠나면 저장하지 않은 것을 잃는다";
  };
  win.addEventListener("beforeunload", handler);
  return () => win.removeEventListener("beforeunload", handler);
}
