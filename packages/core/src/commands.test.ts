import { describe, expect, it } from "vitest";
import { CommandRegistry, formatShortcut, matchShortcut, parseShortcut } from "./commands";

const key = (k: string, mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe("shortcut", () => {
  it("파싱", () => {
    expect(parseShortcut("Ctrl+Shift+Z")).toEqual({ key: "z", primary: true, control: false, shift: true, alt: false });
    expect(parseShortcut("Shift+F5").key).toBe("f5");
    expect(() => parseShortcut("Ctrl+")).toThrow();
  });

  it("mac 에서 Ctrl 은 Cmd 다", () => {
    expect(matchShortcut("Ctrl+S", key("s", { meta: true }), "mac")).toBe(true);
    expect(matchShortcut("Ctrl+S", key("s", { ctrl: true }), "mac")).toBe(false);
    expect(matchShortcut("Ctrl+S", key("s", { ctrl: true }), "win")).toBe(true);
    expect(matchShortcut("Ctrl+S", key("s", { meta: true }), "win")).toBe(false);
  });

  it("보조키가 정확히 맞아야 한다", () => {
    expect(matchShortcut("Ctrl+S", key("s", { meta: true, shift: true }), "mac")).toBe(false);
    expect(matchShortcut("Ctrl+Shift+Z", key("Z", { meta: true, shift: true }), "mac")).toBe(true);
    expect(matchShortcut("F5", key("F5"), "win")).toBe(true);
    expect(matchShortcut("Delete", key("Delete"), "linux")).toBe(true);
    expect(matchShortcut("Control+K", key("k", { ctrl: true }), "mac")).toBe(true);
  });

  it("표기", () => {
    expect(formatShortcut("Ctrl+Shift+Z", "mac")).toBe("⇧⌘Z");
    expect(formatShortcut("Ctrl+Shift+Z", "win")).toBe("Ctrl+Shift+Z");
    expect(formatShortcut("Shift+F5", "linux")).toBe("Shift+F5");
    expect(formatShortcut("Delete", "mac")).toBe("Delete");
  });
});

describe("CommandRegistry", () => {
  it("등록, 실행, 활성, 단축키 찾기", async () => {
    const r = new CommandRegistry({ platform: "mac" });
    let ran = 0;
    let enabled = true;
    const off = r.register({ id: "file.save", label: "저장", shortcut: "Ctrl+S", run: () => void ran++, enabled: () => enabled });
    r.register({ id: "edit.undo", label: "되돌리기", shortcut: "Ctrl+Z", run: () => {} });
    expect(await r.execute("file.save")).toBe(true);
    expect(ran).toBe(1);
    expect(r.findByKey(key("s", { meta: true }))).toBe("file.save");
    enabled = false;
    expect(r.findByKey(key("s", { meta: true }))).toBe(null);
    expect(await r.execute("file.save")).toBe(false);
    expect(r.formatShortcut("edit.undo")).toBe("⌘Z");
    off();
    expect(r.get("file.save")).toBeUndefined();
    expect(() => r.register({ id: "edit.undo", label: "x", run: () => {} })).toThrow();
  });
});
