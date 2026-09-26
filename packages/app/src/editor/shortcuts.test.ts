// @vitest-environment jsdom
import { CommandRegistry, MemoryBackend } from "@initial-editor/core";
import { describe, expect, it, vi } from "vitest";
import {
  allowedInEditable,
  installShortcuts,
  installUnloadGuard,
  isBoundKey,
  isBoundReloadKey,
  isEditableTarget,
  isReloadKey,
  losesWorkOnUnload,
  resolveShortcut,
} from "./shortcuts";

function registry(platform: "mac" | "win" = "mac") {
  const commands = new CommandRegistry({ platform });
  const calls: string[] = [];
  const add = (id: string, shortcut: string | undefined, enabled: boolean | (() => boolean) = true) =>
    commands.register({ id, label: id, shortcut, enabled: typeof enabled === "function" ? enabled : () => enabled, run: () => void calls.push(id) });
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

  it("입력 칸 안에서는 file.* 와 run.* 와 F5 계열과 되돌리기와 다시 실행만 통한다", () => {
    const { commands } = registry();
    expect(resolveShortcut(commands, key("s", { meta: true }), true)).toBe("file.save");
    expect(resolveShortcut(commands, key("z", { meta: true }), true)).toBe("edit.undo");
    expect(resolveShortcut(commands, key("z", { meta: true, shift: true }), true)).toBe("edit.redo");
    expect(resolveShortcut(commands, key("f", { meta: true }), true)).toBeNull();
    expect(resolveShortcut(commands, key("n", { meta: true, shift: true }), true)).toBeNull();
    expect(allowedInEditable("file.openProject")).toBe(true);
    expect(allowedInEditable("run.start")).toBe(true);
    expect(allowedInEditable("run.reload")).toBe(true);
    expect(allowedInEditable("scene.new")).toBe(false);
  });

  it("스크립트 편집기(textarea) 안에서도 실행 키가 통한다: F5, Shift+F5, Ctrl+F5, 리로드, F5 에 묶인 다른 커맨드", () => {
    const commands = new CommandRegistry({ platform: "mac" });
    const add = (id: string, shortcut: string) => commands.register({ id, label: id, shortcut, run: () => {} });
    add("run.start", "F5");
    add("run.stop", "Shift+F5");
    add("run.fromScene", "Ctrl+F5");
    add("run.reload", "Ctrl+Shift+R");
    add("map.debugHere", "Alt+F5");
    add("edit.find", "Ctrl+F");
    expect(resolveShortcut(commands, key("F5"), true)).toBe("run.start");
    expect(resolveShortcut(commands, key("F5", { shift: true }), true)).toBe("run.stop");
    expect(resolveShortcut(commands, key("F5", { meta: true }), true)).toBe("run.fromScene");
    expect(resolveShortcut(commands, key("r", { meta: true, shift: true }), true)).toBe("run.reload");
    expect(resolveShortcut(commands, key("F5", { alt: true }), true)).toBe("map.debugHere");
    expect(resolveShortcut(commands, key("f", { meta: true }), true)).toBeNull();
  });

  it("비활성 커맨드는 실행하지 않지만 키에 묶여 있는 것은 안다", () => {
    const { commands } = registry();
    expect(resolveShortcut(commands, key("F5"), false)).toBeNull();
    expect(isBoundKey(commands, key("F5"))).toBe(true);
    expect(isBoundKey(commands, key("F6"))).toBe(false);
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

  it("installShortcuts: 스크립트 편집기 안의 F5 는 실행하고 기본 동작(새로 고침)을 막는다", async () => {
    let running = false;
    const commands = new CommandRegistry({ platform: "mac" });
    const calls: string[] = [];
    commands.register({ id: "run.start", label: "실행", shortcut: "F5", enabled: () => !running, run: () => void calls.push("run.start") });
    commands.register({ id: "run.stop", label: "정지", shortcut: "Shift+F5", enabled: () => running, run: () => void calls.push("run.stop") });
    const off = installShortcuts(commands, window);
    const textarea = document.createElement("textarea");
    document.body.append(textarea);

    const f5 = new KeyboardEvent("keydown", { key: "F5", bubbles: true, cancelable: true });
    textarea.dispatchEvent(f5);
    await Promise.resolve();
    expect(calls).toEqual(["run.start"]);
    expect(f5.defaultPrevented).toBe(true);

    running = true;
    const stop = new KeyboardEvent("keydown", { key: "F5", shiftKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(stop);
    await Promise.resolve();
    expect(calls).toEqual(["run.start", "run.stop"]);
    expect(stop.defaultPrevented).toBe(true);

    // 실행 중이라 F5 커맨드가 비활성이어도 페이지를 새로 고치지 않는다
    const again = new KeyboardEvent("keydown", { key: "F5", bubbles: true, cancelable: true });
    window.dispatchEvent(again);
    await Promise.resolve();
    expect(calls).toEqual(["run.start", "run.stop"]);
    expect(again.defaultPrevented).toBe(true);

    // 묶이지 않은 기능 키는 건드리지 않는다
    const f6 = new KeyboardEvent("keydown", { key: "F6", bubbles: true, cancelable: true });
    window.dispatchEvent(f6);
    expect(f6.defaultPrevented).toBe(false);
    off();
  });

  it("installShortcuts: IME 조합 중에도 묶인 F5 계열은 실행하고 기본 동작을 막는다. 다른 단축키는 조합에 맡긴다", async () => {
    let running = false;
    const commands = new CommandRegistry({ platform: "mac" });
    const calls: string[] = [];
    commands.register({ id: "file.save", label: "저장", shortcut: "Ctrl+S", run: () => void calls.push("file.save") });
    commands.register({ id: "run.start", label: "실행", shortcut: "F5", enabled: () => !running, run: () => void calls.push("run.start") });
    commands.register({ id: "run.stop", label: "정지", shortcut: "Shift+F5", enabled: () => running, run: () => void calls.push("run.stop") });
    const off = installShortcuts(commands, window);
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    const composing = (init: KeyboardEventInit) => {
      const ev = new KeyboardEvent("keydown", { ...init, isComposing: true, bubbles: true, cancelable: true });
      expect(ev.isComposing).toBe(true);
      textarea.dispatchEvent(ev);
      return ev;
    };

    const f5 = composing({ key: "F5" });
    await Promise.resolve();
    expect(calls).toEqual(["run.start"]);
    expect(f5.defaultPrevented).toBe(true);

    running = true;
    const stop = composing({ key: "F5", shiftKey: true });
    await Promise.resolve();
    expect(calls).toEqual(["run.start", "run.stop"]);
    expect(stop.defaultPrevented).toBe(true);

    // 비활성이어도 새로 고침은 막는다
    const disabled = composing({ key: "F5" });
    expect(disabled.defaultPrevented).toBe(true);

    // 조합 중의 Cmd+S 는 부르지 않는다 (조합이 끝난 뒤의 키가 저장한다)
    const save = composing({ key: "s", metaKey: true });
    await Promise.resolve();
    expect(calls).toEqual(["run.start", "run.stop"]);
    expect(save.defaultPrevented).toBe(false);
    off();
  });

  it("installShortcuts: 모달 대화상자가 떠 있으면 커맨드를 부르지 않고 묶인 F5 의 새로 고침만 막는다", async () => {
    let modal = true;
    const commands = new CommandRegistry({ platform: "mac" });
    const calls: string[] = [];
    commands.register({ id: "file.save", label: "저장", shortcut: "Ctrl+S", run: () => void calls.push("file.save") });
    commands.register({ id: "run.start", label: "실행", shortcut: "F5", run: () => void calls.push("run.start") });
    commands.register({ id: "run.stop", label: "정지", shortcut: "Shift+F5", run: () => void calls.push("run.stop") });
    const off = installShortcuts(commands, window, { suspended: () => modal });
    const input = document.createElement("input");
    document.body.append(input);
    const press = (init: KeyboardEventInit) => {
      const ev = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
      input.dispatchEvent(ev);
      return ev;
    };

    const f5 = press({ key: "F5" });
    const shiftF5 = press({ key: "F5", shiftKey: true });
    const save = press({ key: "s", metaKey: true });
    const f6 = press({ key: "F6" });
    await Promise.resolve();
    expect(calls).toEqual([]);
    expect(f5.defaultPrevented).toBe(true);
    expect(shiftF5.defaultPrevented).toBe(true);
    // 대화상자 안의 다른 키는 대화상자와 브라우저에 맡긴다
    expect(save.defaultPrevented).toBe(false);
    expect(f6.defaultPrevented).toBe(false);

    // 닫히면 다시 통한다
    modal = false;
    press({ key: "F5" });
    await Promise.resolve();
    expect(calls).toEqual(["run.start"]);
    off();
  });
});

describe("새로 고침 계열 키", () => {
  it("F5와 그 조합, Ctrl+R과 Ctrl+Shift+R(mac은 Cmd)이다", () => {
    expect(isReloadKey(key("F5"), "mac")).toBe(true);
    expect(isReloadKey(key("F5", { shift: true }), "win")).toBe(true);
    expect(isReloadKey(key("F5", { ctrl: true }), "win")).toBe(true);
    expect(isReloadKey(key("r", { meta: true }), "mac")).toBe(true);
    expect(isReloadKey(key("R", { meta: true, shift: true }), "mac")).toBe(true);
    expect(isReloadKey(key("r", { ctrl: true }), "win")).toBe(true);
    expect(isReloadKey(key("R", { ctrl: true, shift: true }), "linux")).toBe(true);
    // mac의 Ctrl+R과 그 밖의 Cmd+R은 새로 고침이 아니다
    expect(isReloadKey(key("r", { ctrl: true }), "mac")).toBe(false);
    expect(isReloadKey(key("r", { meta: true }), "win")).toBe(false);
    expect(isReloadKey(key("r", { meta: true, alt: true }), "mac")).toBe(false);
    expect(isReloadKey(key("r"), "mac")).toBe(false);
    expect(isReloadKey(key("s", { meta: true }), "mac")).toBe(false);
  });

  it("비활성 커맨드에 묶인 Ctrl+Shift+R도 기본 동작(브라우저의 강력 새로 고침)을 막는다. 묶이지 않은 Ctrl+R은 건드리지 않는다", async () => {
    for (const platform of ["mac", "win"] as const) {
      let canReload = false;
      const commands = new CommandRegistry({ platform });
      const calls: string[] = [];
      commands.register({ id: "run.reload", label: "리로드", shortcut: "Ctrl+Shift+R", enabled: () => canReload, run: () => void calls.push("run.reload") });
      const off = installShortcuts(commands, window);
      const primary = platform === "mac" ? { metaKey: true } : { ctrlKey: true };
      const press = (init: KeyboardEventInit, target: EventTarget = window) => {
        const ev = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
        target.dispatchEvent(ev);
        return ev;
      };

      const disabled = press({ key: "R", shiftKey: true, ...primary });
      await Promise.resolve();
      expect(calls, platform).toEqual([]);
      expect(disabled.defaultPrevented, platform).toBe(true);
      expect(isBoundReloadKey(commands, key("R", platform === "mac" ? { meta: true, shift: true } : { ctrl: true, shift: true }))).toBe(true);
      expect(isBoundReloadKey(commands, key("r", platform === "mac" ? { meta: true } : { ctrl: true }))).toBe(false);

      // 묶이지 않은 Ctrl+R(Shift 없이)은 브라우저에 맡긴다
      const plain = press({ key: "r", ...primary });
      expect(plain.defaultPrevented, platform).toBe(false);

      // 입력 칸 안에서도 막고, 켜져 있으면 실행한다
      const textarea = document.createElement("textarea");
      document.body.append(textarea);
      const inEditor = press({ key: "R", shiftKey: true, ...primary }, textarea);
      expect(inEditor.defaultPrevented, platform).toBe(true);
      canReload = true;
      const enabled = press({ key: "R", shiftKey: true, ...primary }, textarea);
      await Promise.resolve();
      expect(calls, platform).toEqual(["run.reload"]);
      expect(enabled.defaultPrevented, platform).toBe(true);
      off();
    }
  });

  it("Ctrl+R에 묶인 커맨드가 있으면 비활성이어도 막는다", () => {
    const commands = new CommandRegistry({ platform: "win" });
    commands.register({ id: "run.restartHere", label: "여기서 다시", shortcut: "Ctrl+R", enabled: () => false, run: () => {} });
    const off = installShortcuts(commands, window);
    const ev = new KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Ctrl+Shift+R은 묶이지 않아서 건드리지 않는다
    const hard = new KeyboardEvent("keydown", { key: "R", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(hard);
    expect(hard.defaultPrevented).toBe(false);
    off();
  });

  it("IME 조합 중과 모달 대화상자가 떠 있을 때도 묶인 Cmd+Shift+R은 페이지를 새로 고치지 않는다", async () => {
    let modal = false;
    let canReload = true;
    const commands = new CommandRegistry({ platform: "mac" });
    const calls: string[] = [];
    commands.register({ id: "run.reload", label: "리로드", shortcut: "Ctrl+Shift+R", enabled: () => canReload, run: () => void calls.push("run.reload") });
    const off = installShortcuts(commands, window, { suspended: () => modal });
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    const press = (composing: boolean) => {
      const ev = new KeyboardEvent("keydown", { key: "R", metaKey: true, shiftKey: true, isComposing: composing, bubbles: true, cancelable: true });
      textarea.dispatchEvent(ev);
      return ev;
    };

    const composing = press(true);
    await Promise.resolve();
    expect(calls).toEqual(["run.reload"]);
    expect(composing.defaultPrevented).toBe(true);
    canReload = false;
    expect(press(true).defaultPrevented).toBe(true);

    modal = true;
    canReload = true;
    const inModal = press(false);
    await Promise.resolve();
    expect(calls).toEqual(["run.reload"]);
    expect(inModal.defaultPrevented).toBe(true);
    off();
  });
});

describe("installUnloadGuard", () => {
  /** BeforeUnloadEvent 처럼 returnValue 가 글인 이벤트 (jsdom 의 Event.returnValue 는 불리언이다) */
  function beforeUnload(): Event {
    const ev = new Event("beforeunload", { cancelable: true });
    Object.defineProperty(ev, "returnValue", { value: "", writable: true });
    return ev;
  }

  it("저장하지 않은 문서가 있을 때만 떠나기 전에 묻는다", () => {
    let dirty = false;
    const target = new EventTarget();
    const off = installUnloadGuard(() => dirty, target);
    const clean = beforeUnload();
    target.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    dirty = true;
    const ev = beforeUnload();
    target.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect((ev as unknown as { returnValue: unknown }).returnValue).toBeTruthy();

    off();
    const after = beforeUnload();
    target.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("메모리 백엔드에 이번 세션에 저장한 것이 있으면 문서가 모두 저장되어 있어도 묻는다 (에디터의 레이아웃 파일은 세지 않는다)", async () => {
    const backend = new MemoryBackend({ "game.json": "{}", "scripts/lua/main.lua": "-- a" });
    await backend.open("memory://sample");
    const target = new EventTarget();
    const off = installUnloadGuard(() => losesWorkOnUnload(0, backend), target);
    const ask = () => {
      const ev = beforeUnload();
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(ask()).toBe(false);
    await backend.writeText(".initial-editor/layout.json", "{}");
    expect(ask()).toBe(false);
    await backend.writeText("scripts/lua/main.lua", "-- b");
    expect(ask()).toBe(true);
    off();

    // 디스크에 쓰는 백엔드(volatileWrites가 없다)는 문서만 본다
    expect(losesWorkOnUnload(0, {})).toBe(false);
    expect(losesWorkOnUnload(2, {})).toBe(true);
  });
});
