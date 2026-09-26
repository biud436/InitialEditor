// @vitest-environment jsdom
import { CommandRegistry } from "@initial-editor/core";
import { describe, expect, it, vi } from "vitest";
import { allowedInEditable, installShortcuts, isEditableTarget, resolveShortcut } from "./shortcuts";

function registry(platform: "mac" | "win" = "mac") {
  const commands = new CommandRegistry({ platform });
  const calls: string[] = [];
  const add = (id: string, shortcut: string, enabled = true) => commands.register({ id, label: id, shortcut, enabled: () => enabled, run: () => void calls.push(id) });
  add("file.save", "Ctrl+S");
  add("edit.undo", "Ctrl+Z");
  add("edit.redo", "Ctrl+Shift+Z");
  add("edit.find", "Ctrl+F");
  add("run.start", "F5", false);
  add("scene.new", "Ctrl+Shift+N");
  return { commands, calls };
}

const key = (k: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key: k,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe("단축키 규칙", () => {
  it("입력 칸 밖에서는 모든 활성 커맨드가 통한다", () => {
    const { commands } = registry();
    expect(resolveShortcut(commands, key("s", { meta: true }), false)).toBe("file.save");
    expect(resolveShortcut(commands, key("f", { meta: true }), false)).toBe("edit.find");
    expect(resolveShortcut(commands, key("n", { meta: true, shift: true }), false)).toBe("scene.new");
  });

  it("입력 칸 안에서는 file.* 와 되돌리기와 다시 실행만 통한다", () => {
    const { commands } = registry();
    expect(resolveShortcut(commands, key("s", { meta: true }), true)).toBe("file.save");
    expect(resolveShortcut(commands, key("z", { meta: true }), true)).toBe("edit.undo");
    expect(resolveShortcut(commands, key("z", { meta: true, shift: true }), true)).toBe("edit.redo");
    expect(resolveShortcut(commands, key("f", { meta: true }), true)).toBeNull();
    expect(resolveShortcut(commands, key("n", { meta: true, shift: true }), true)).toBeNull();
    expect(allowedInEditable("file.openProject")).toBe(true);
    expect(allowedInEditable("scene.new")).toBe(false);
  });

  it("비활성 커맨드는 잡지 않는다 (F5 는 브라우저 새로 고침으로 남는다)", () => {
    const { commands } = registry();
    expect(resolveShortcut(commands, key("F5"), false)).toBeNull();
  });

  it("mac 은 Cmd, 그 밖은 Ctrl", () => {
    const mac = registry("mac");
    expect(resolveShortcut(mac.commands, key("s", { ctrl: true }), false)).toBeNull();
    const win = registry("win");
    expect(resolveShortcut(win.commands, key("s", { ctrl: true }), false)).toBe("file.save");
    expect(resolveShortcut(win.commands, key("s", { meta: true }), false)).toBeNull();
  });

  it("isEditableTarget 은 input, textarea, contenteditable 을 안다", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const div = document.createElement("div");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, textarea, div, editable);
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(div)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    // jsdom 은 isContentEditable 을 구현하지 않으므로 속성으로 흉내 낸다
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isEditableTarget(editable)).toBe(true);
  });

  it("installShortcuts 는 keydown 을 커맨드 실행으로 보내고 기본 동작을 막는다", async () => {
    const { commands, calls } = registry("mac");
    const off = installShortcuts(commands, window);
    const ev = new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true, cancelable: true });
    const prevented = vi.spyOn(ev, "preventDefault");
    window.dispatchEvent(ev);
    await Promise.resolve();
    expect(calls).toEqual(["file.save"]);
    expect(prevented).toHaveBeenCalled();

    const input = document.createElement("input");
    document.body.append(input);
    const inInput = new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(inInput);
    await Promise.resolve();
    expect(calls).toEqual(["file.save"]);
    off();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }));
    await Promise.resolve();
    expect(calls).toEqual(["file.save"]);
  });
});
