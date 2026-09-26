// Tauri 모드의 네이티브 앱 메뉴. HTML 메뉴 바와 같은 트리(menus.tree())에서 만든다.
// Tauri API 는 동적 import 로만 든다. 브라우저 빌드는 이 모듈을 불러도 Tauri 코드를 내려받지 않는다.

import { parseShortcut, type MenuNode } from "@initial-editor/core";
import { isTauri } from "@initial-editor/backend-tauri";
import { reaction } from "mobx";
import type { Editor } from "./Editor";

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

/** 우리 자리표시자 대신 OS 의 편집 항목을 쓰는 커맨드 */
const PREDEFINED: Record<string, PredefinedKind> = {
  "edit.cut": "Cut",
  "edit.copy": "Copy",
  "edit.paste": "Paste",
};

async function buildItems(api: MenuApi, editor: Editor, nodes: MenuNode[]): Promise<AnyItem[]> {
  const items: AnyItem[] = [];
  for (const node of nodes) {
    if (node.separatorBefore && items.length) items.push(await api.PredefinedMenuItem.new({ item: "Separator" }));
    if (node.children.length) {
      items.push(await api.Submenu.new({ text: node.label, items: await buildItems(api, editor, node.children) }));
      continue;
    }
    const id = node.commandId;
    if (!id) continue;
    const predefined = PREDEFINED[id];
    if (predefined) {
      items.push(await api.PredefinedMenuItem.new({ item: predefined, text: editor.commandLabel(id) }));
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
        action: () => void editor.commands.execute(id),
      }),
    );
  }
  return items;
}

async function buildMenu(api: MenuApi, editor: Editor) {
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
  items.push(...(await buildItems(api, editor, editor.menus.tree())));
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
  let timer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let again = false;
  const rebuild = async () => {
    if (building) {
      again = true;
      return;
    }
    building = true;
    try {
      await buildMenu(api, editor);
    } catch (e) {
      editor.log.warn("editor", `네이티브 메뉴를 만들지 못했다: ${(e as Error).message}`);
    } finally {
      building = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 100);
  };
  const disposers = [
    editor.menus.events.on("change", schedule),
    editor.commands.events.on("change", schedule),
    reaction(
      () => editor.commands.list().map((c) => `${c.id}:${editor.commands.isEnabled(c.id) ? 1 : 0}:${editor.commandChecked(c.id) ? 1 : 0}:${editor.commandLabel(c.id)}`).join("|"),
      schedule,
    ),
  ];
  await rebuild();
  return () => {
    if (timer) clearTimeout(timer);
    for (const d of disposers) d();
  };
}
