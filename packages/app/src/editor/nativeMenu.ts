// Tauri 모드의 네이티브 앱 메뉴. HTML 메뉴 바와 같은 트리(menus.tree())에서 만든다.
// Tauri API 는 동적 import 로만 든다. 브라우저 빌드는 이 모듈을 불러도 Tauri 코드를 내려받지 않는다.
//
// 잘라내기, 복사, 붙여넣기는 상태에 따라 항목을 바꿔 끼운다 (clipboardRoute).
//   - 씬이나 맵 탭이 활성이고, 초점이 입력 칸 밖이고, 글자를 고르지 않았고, 커맨드가 켜져 있으면: 우리 MenuItem.
//     누르면 edit.* 커맨드가 오브젝트를 복사하고 붙인다
//   - 그 밖(입력 칸, Monaco, 콘솔의 글자 선택): OS의 PredefinedMenuItem. 글자 편집은 OS가 한다
// 우리 항목에서 스크립트로 글자 편집을 대신하지 않는 이유: WKWebView는 사용자 입력 밖에서 부른
// document.execCommand("paste")를 막는다 (wry가 DOMPasteAllowed를 켜지 않는다). 그래서 글자 편집은 OS 항목에 맡기고,
// 상태가 바뀌면(초점, 글자 선택, 활성 탭, 커맨드 활성) 메뉴를 다시 짓는다. 다시 짓기 전의 짧은 틈에 우리 항목이 눌리면
// 다시 판단해 execCommand로 복사와 잘라내기만 해 본다.
// 단축키(Cmd+C 등)는 웹뷰가 먼저 받는다. shortcuts.ts가 처리하면 기본 동작을 막아 메뉴 가속기가 두 번 돌지 않는다.

import { SCENE_KIND, parseShortcut, visibleMenu, type MenuNode } from "@initial-editor/core";
import { isTauri } from "@initial-editor/backend-tauri";
import { MAP_KIND } from "@initial-editor/ext-tilemap/model";
import { observable, reaction, runInAction } from "mobx";
import type { Editor } from "./Editor";
import { isEditableTarget } from "./shortcuts";

type MenuApi = typeof import("@tauri-apps/api/menu");
type AnyItem = Awaited<ReturnType<MenuApi["MenuItem"]["new"]>> | Awaited<ReturnType<MenuApi["Submenu"]["new"]>> | Awaited<ReturnType<MenuApi["PredefinedMenuItem"]["new"]>>;
type PredefinedKind = "Cut" | "Copy" | "Paste" | "SelectAll" | "Separator" | "Quit" | "Hide" | "HideOthers" | "ShowAll" | "Services" | "Minimize" | "CloseWindow";

/** 커맨드의 단축키 표기를 Tauri 가속기로. "Ctrl+Shift+Z" → "CmdOrCtrl+Shift+Z", "F5" → "F5" */
export function toAccelerator(shortcut: string): string {
  const s = parseShortcut(shortcut);
  const parts: string[] = [];
  if (s.primary) parts.push("CmdOrCtrl");
  if (s.control) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("Shift");
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key.charAt(0).toUpperCase() + s.key.slice(1);
  parts.push(key);
  return parts.join("+");
}

export type ClipboardKind = "cut" | "copy" | "paste";

/** 상태에 따라 OS의 편집 항목과 우리 항목을 오가는 커맨드 */
export const CLIPBOARD_COMMANDS: Readonly<Record<string, ClipboardKind>> = {
  "edit.cut": "cut",
  "edit.copy": "copy",
  "edit.paste": "paste",
};

const PREDEFINED: Record<ClipboardKind, PredefinedKind> = { cut: "Cut", copy: "Copy", paste: "Paste" };

export interface ClipboardState {
  /** 활성 문서의 종류 (없으면 null) */
  activeKind: string | null;
  /** 초점이 입력 칸(input, textarea, contenteditable, Monaco)에 있다 */
  editableFocus: boolean;
  /** 입력 칸 밖에서 글자를 골라 두었다 (콘솔 등) */
  textSelected: boolean;
  /** 그 edit.* 커맨드가 켜져 있다 */
  commandEnabled: boolean;
}

/** command: 우리 커맨드(오브젝트), native: OS의 글자 편집 */
export type ClipboardRoute = "command" | "native";

export function clipboardRoute(s: ClipboardState): ClipboardRoute {
  if (s.editableFocus || s.textSelected) return "native";
  if (s.activeKind !== SCENE_KIND && s.activeKind !== MAP_KIND) return "native";
  return s.commandEnabled ? "command" : "native";
}

export interface ClipboardItemDeps {
  route(): ClipboardRoute;
  execute(id: string): Promise<boolean>;
  /** document.execCommand. 막혔으면 false */
  execCommand(kind: ClipboardKind): boolean;
  /** 메뉴를 곧바로 다시 짓는다 */
  rebuild(): void;
}

/** 우리 항목이 눌렸을 때. 메뉴를 지은 뒤 상태가 바뀌었을 수 있어 다시 판단한다. 한 일을 돌려준다 */
export async function runClipboardItem(id: string, deps: ClipboardItemDeps): Promise<"command" | "native" | "blocked"> {
  const kind = CLIPBOARD_COMMANDS[id];
  if (!kind) throw new Error(`편집 커맨드가 아니다: ${id}`);
  if (deps.route() === "command") {
    await deps.execute(id);
    return "command";
  }
  deps.rebuild();
  let ok = false;
  try {
    ok = deps.execCommand(kind);
  } catch {
    ok = false;
  }
  return ok ? "native" : "blocked";
}

/** 초점과 글자 선택을 따라가는 관찰 가능한 상태. 돌려주는 함수로 뗀다 */
export function watchTextContext(doc: Document): { editable: () => boolean; selected: () => boolean; dispose: () => void } {
  const state = observable({ editable: false, selected: false });
  const readFocus = () => runInAction(() => (state.editable = isEditableTarget(doc.activeElement)));
  const readSelection = () => {
    const sel = doc.getSelection();
    const selected = !!sel && !sel.isCollapsed && sel.toString() !== "" && !isEditableTarget(doc.activeElement);
    if (selected !== state.selected) runInAction(() => (state.selected = selected));
  };
  const onFocusOut = () => setTimeout(readFocus, 0);
  doc.addEventListener("focusin", readFocus);
  doc.addEventListener("focusout", onFocusOut);
  doc.addEventListener("selectionchange", readSelection);
  readFocus();
  readSelection();
  return {
    editable: () => state.editable,
    selected: () => state.selected,
    dispose: () => {
      doc.removeEventListener("focusin", readFocus);
      doc.removeEventListener("focusout", onFocusOut);
      doc.removeEventListener("selectionchange", readSelection);
    },
  };
}

export interface RebuildScheduler {
  /** delay(ms) 뒤에 다시 짓는다. 그 전에 또 부르면 미룬다. delay 0이 기다리는 동안의 다른 예약은 거기에 얹힌다 */
  schedule(delay?: number): void;
  /** 곧바로 짓는다. 짓는 중이면 끝난 뒤 한 번 더 짓는다 */
  rebuild(): Promise<void>;
  dispose(): void;
}

export const REBUILD_DELAY_MS = 100;

/** 네이티브 메뉴 다시 짓기의 예약. 짓기는 한 번에 하나만 돈다 */
export function createRebuildScheduler(build: () => Promise<void>, onError: (e: Error) => void): RebuildScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let urgent = false;
  let building = false;
  let again = false;
  let disposed = false;
  const rebuild = async () => {
    if (disposed) return;
    if (building) {
      again = true;
      return;
    }
    building = true;
    try {
      await build();
    } catch (e) {
      onError(e as Error);
    } finally {
      building = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  };
  const schedule = (delay = REBUILD_DELAY_MS) => {
    if (disposed || (timer && urgent)) return;
    if (timer) clearTimeout(timer);
    urgent = delay === 0;
    timer = setTimeout(() => {
      timer = null;
      urgent = false;
      void rebuild();
    }, delay);
  };
  return {
    schedule,
    rebuild,
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

interface BuildContext {
  route(id: string): ClipboardRoute;
  runClipboard(id: string): void;
}

async function buildItems(api: MenuApi, editor: Editor, nodes: MenuNode[], ctx: BuildContext): Promise<AnyItem[]> {
  const items: AnyItem[] = [];
  for (const node of nodes) {
    if (node.separatorBefore && items.length) items.push(await api.PredefinedMenuItem.new({ item: "Separator" }));
    if (node.children.length) {
      items.push(await api.Submenu.new({ text: node.label, items: await buildItems(api, editor, node.children, ctx) }));
      continue;
    }
    const id = node.commandId;
    if (!id) continue;
    const clipboard = CLIPBOARD_COMMANDS[id];
    if (clipboard && ctx.route(id) === "native") {
      items.push(await api.PredefinedMenuItem.new({ item: PREDEFINED[clipboard], text: editor.commandLabel(id) }));
      continue;
    }
    const cmd = editor.commands.get(id);
    if (!cmd) continue;
    const checked = editor.commandChecked(id);
    items.push(
      await api.MenuItem.new({
        id,
        text: (checked ? "✓ " : "") + editor.commandLabel(id),
        enabled: editor.commands.isEnabled(id),
        accelerator: cmd.shortcut ? toAccelerator(cmd.shortcut) : undefined,
        action: clipboard ? () => ctx.runClipboard(id) : () => void editor.commands.execute(id),
      }),
    );
  }
  return items;
}

async function buildMenu(api: MenuApi, editor: Editor, ctx: BuildContext) {
  const items: AnyItem[] = [];
  if (editor.commands.context.platform === "mac") {
    items.push(
      await api.Submenu.new({
        text: "InitialEditor",
        items: [
          await api.PredefinedMenuItem.new({ item: { About: { name: "InitialEditor", version: editor.version } } }),
          await api.PredefinedMenuItem.new({ item: "Separator" }),
          await api.PredefinedMenuItem.new({ item: "Services" }),
          await api.PredefinedMenuItem.new({ item: "Separator" }),
          await api.PredefinedMenuItem.new({ item: "Hide" }),
          await api.PredefinedMenuItem.new({ item: "HideOthers" }),
          await api.PredefinedMenuItem.new({ item: "ShowAll" }),
          await api.PredefinedMenuItem.new({ item: "Separator" }),
          await api.PredefinedMenuItem.new({ item: "Quit" }),
        ],
      }),
    );
  }
  items.push(...(await buildItems(api, editor, visibleMenu(editor.menus.tree(), (id) => editor.commands.isVisible(id)), ctx)));
  if (editor.commands.context.platform !== "mac") {
    const file = items.find((i) => i.kind === "Submenu") as Awaited<ReturnType<MenuApi["Submenu"]["new"]>> | undefined;
    if (file) {
      await file.append(await api.PredefinedMenuItem.new({ item: "Separator" }));
      await file.append(await api.PredefinedMenuItem.new({ item: "Quit", text: "끝내기" }));
    }
  }
  const menu = await api.Menu.new({ items });
  await menu.setAsAppMenu();
}

/** 메뉴와 커맨드와 활성 상태가 바뀌면 다시 짓는다. 돌려주는 함수로 멈춘다 */
export async function installNativeMenu(editor: Editor): Promise<() => void> {
  if (!isTauri()) return () => {};
  const api = await import("@tauri-apps/api/menu");
  const text = watchTextContext(document);
  const route = (id: string): ClipboardRoute =>
    clipboardRoute({
      activeKind: editor.documents.active?.kind ?? null,
      editableFocus: text.editable(),
      textSelected: text.selected(),
      commandEnabled: editor.commands.isEnabled(id),
    });
  const ctx: BuildContext = {
    route,
    runClipboard: (id) => {
      void runClipboardItem(id, {
        route: () => route(id),
        execute: (cid) => editor.commands.execute(cid),
        execCommand: (kind) => document.execCommand(kind),
        rebuild: () => schedule(0),
      }).then((done) => {
        if (done === "blocked") editor.log.warn("editor", `하지 못했다: ${editor.commandLabel(id)}. 메뉴를 다시 지었으니 한 번 더 누른다`);
      });
    },
  };
  const scheduler = createRebuildScheduler(
    () => buildMenu(api, editor, ctx),
    (e) => editor.log.warn("editor", `네이티브 메뉴를 만들지 못했다: ${e.message}`),
  );
  const schedule = scheduler.schedule;
  const disposers = [
    editor.menus.events.on("change", () => schedule()),
    editor.commands.events.on("change", () => schedule()),
    reaction(
      () =>
        editor.commands
          .list()
          .map((c) => `${c.id}:${editor.commands.isVisible(c.id) ? 1 : 0}:${editor.commands.isEnabled(c.id) ? 1 : 0}:${editor.commandChecked(c.id) ? 1 : 0}:${editor.commandLabel(c.id)}`)
          .join("|"),
      () => schedule(),
    ),
    // 편집 항목의 종류가 바뀌면 곧바로 (입력 칸에 들어가자마자 붙여넣기를 누를 수 있다)
    reaction(
      () => Object.keys(CLIPBOARD_COMMANDS).map(route).join("|"),
      () => schedule(0),
    ),
    text.dispose,
    scheduler.dispose,
  ];
  await scheduler.rebuild();
  return () => {
    for (const d of disposers) d();
  };
}
