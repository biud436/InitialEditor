// 커맨드 레지스트리 (docs/plans/02-scope-and-screens.md 5절).
// 메뉴와 툴바와 단축키는 전부 여기 등록된 커맨드 하나를 가리킨다. 옛 에디터에서 메뉴 단축키가
// 전부 빈 문자열에 묶였던 버그는 메뉴가 단축키를 따로 들고 있어서 났다. 여기서는 단축키가
// 커맨드의 속성이고 그것 하나만 있다.
//
// 단축키 표기: "Ctrl+S", "Ctrl+Shift+Z", "Shift+F5", "Delete". macOS 에서 Ctrl 은 Cmd 로 읽는다
// (진짜 Control 이 필요하면 "Control+" 로 적는다).

import { action, makeObservable, observable } from "mobx";
import { Emitter } from "./events";

export type Platform = "mac" | "win" | "linux";

export interface CommandContext {
  platform: Platform;
}

export interface EditorCommand {
  id: string;
  label: string;
  /** 메뉴의 어느 갈래인지 (표시용). 예: "file", "edit", "scene", "run", "tools", "window", "help" */
  category?: string;
  shortcut?: string;
  /** 툴바 아이콘 이름 (선택) */
  icon?: string;
  run(): void | Promise<void>;
  /** 생략하면 늘 활성 */
  enabled?(): boolean;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ParsedShortcut {
  key: string; // 소문자, 특수키는 그대로 ("f5", "delete", "escape", "enter")
  primary: boolean; // Ctrl (mac 에서는 Cmd)
  control: boolean; // 진짜 Control (mac 에서만 의미)
  shift: boolean;
  alt: boolean;
}

export function parseShortcut(text: string): ParsedShortcut {
  const parts = text.split("+").map((p) => p.trim()).filter(Boolean);
  const parsed: ParsedShortcut = { key: "", primary: false, control: false, shift: false, alt: false };
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === "ctrl" || p === "cmd" || p === "mod") parsed.primary = true;
    else if (p === "control") parsed.control = true;
    else if (p === "shift") parsed.shift = true;
    else if (p === "alt" || p === "option") parsed.alt = true;
    else parsed.key = p;
  }
  if (!parsed.key) throw new Error(`단축키에 키가 없다: ${text}`);
  return parsed;
}

/** 키 이벤트가 단축키와 맞는가 */
export function matchShortcut(shortcut: string, ev: KeyLike, platform: Platform): boolean {
  const s = parseShortcut(shortcut);
  const key = normalizeKey(ev.key);
  if (key !== s.key) return false;
  const primaryDown = platform === "mac" ? ev.metaKey : ev.ctrlKey;
  const controlDown = platform === "mac" ? ev.ctrlKey : false;
  if (s.primary !== primaryDown) return false;
  if (platform === "mac" && s.control !== controlDown) return false;
  if (platform !== "mac" && ev.metaKey) return false;
  if (s.shift !== ev.shiftKey) return false;
  if (s.alt !== ev.altKey) return false;
  return true;
}

function normalizeKey(key: string): string {
  const k = key.toLowerCase();
  if (k === " ") return "space";
  if (k === "esc") return "escape";
  if (k === "del") return "delete";
  return k;
}

/** 메뉴에 보이는 표기. mac: "⌘S", "⇧⌘Z", 그 밖: "Ctrl+S" */
export function formatShortcut(shortcut: string, platform: Platform): string {
  const s = parseShortcut(shortcut);
  const keyLabel = s.key.length === 1 ? s.key.toUpperCase() : capitalize(s.key);
  if (platform === "mac") {
    return `${s.control ? "⌃" : ""}${s.alt ? "⌥" : ""}${s.shift ? "⇧" : ""}${s.primary ? "⌘" : ""}${keyLabel}`;
  }
  const mods = [s.primary ? "Ctrl" : "", s.alt ? "Alt" : "", s.shift ? "Shift" : ""].filter(Boolean);
  return [...mods, keyLabel].join("+");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class CommandRegistry {
  readonly commands = new Map<string, EditorCommand>();
  readonly events = new Emitter<{ change: void; executed: string }>();

  constructor(readonly context: CommandContext) {
    makeObservable(this, { commands: observable.shallow, register: action, unregister: action });
  }

  register(cmd: EditorCommand): () => void {
    if (this.commands.has(cmd.id)) throw new Error(`커맨드가 이미 있다: ${cmd.id}`);
    if (cmd.shortcut) parseShortcut(cmd.shortcut); // 표기 검증
    this.commands.set(cmd.id, cmd);
    this.events.emit("change", undefined);
    return () => this.unregister(cmd.id);
  }

  unregister(id: string): void {
    if (this.commands.delete(id)) this.events.emit("change", undefined);
  }

  get(id: string): EditorCommand | undefined {
    return this.commands.get(id);
  }

  list(): EditorCommand[] {
    return [...this.commands.values()];
  }

  isEnabled(id: string): boolean {
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    return cmd.enabled ? cmd.enabled() : true;
  }

  async execute(id: string): Promise<boolean> {
    const cmd = this.commands.get(id);
    if (!cmd || !this.isEnabled(id)) return false;
    await cmd.run();
    this.events.emit("executed", id);
    return true;
  }

  /** 키 이벤트에 맞는 커맨드 id (활성인 것만). 없으면 null */
  findByKey(ev: KeyLike): string | null {
    for (const cmd of this.commands.values()) {
      if (cmd.shortcut && matchShortcut(cmd.shortcut, ev, this.context.platform) && this.isEnabled(cmd.id)) {
        return cmd.id;
      }
    }
    return null;
  }

  formatShortcut(id: string): string {
    const cmd = this.commands.get(id);
    return cmd?.shortcut ? formatShortcut(cmd.shortcut, this.context.platform) : "";
  }
}
