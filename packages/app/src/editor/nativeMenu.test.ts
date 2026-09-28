// @vitest-environment jsdom
import { CommandRegistry, LogStore, MenuRegistry } from "@initial-editor/core";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "./Editor";
import {
  CLIPBOARD_COMMANDS,
  clipboardRoute,
  createRebuildScheduler,
  installNativeMenu,
  REBUILD_DELAY_MS,
  runClipboardItem,
  toAccelerator,
  watchTextContext,
  type ClipboardItemDeps,
  type ClipboardRoute,
  type ClipboardState,
} from "./nativeMenu";

// Tauri 메뉴 API 대신 지은 항목을 모으는 가짜 (installNativeMenu가 동적 import로 부른다)
type FakeItem = { kind: string; id?: string; text?: string; item?: unknown; enabled?: boolean; items?: FakeItem[]; action?: () => void };
const fake = vi.hoisted(() => ({ menus: [] as FakeItem[][] }));
vi.mock("@initial-editor/backend-tauri", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/menu", () => ({
  PredefinedMenuItem: { new: async (o: { item: unknown; text?: string }) => ({ kind: "Predefined", item: o.item, text: o.text }) },
  MenuItem: { new: async (o: FakeItem) => ({ ...o, kind: "MenuItem" }) },
  Submenu: {
    new: async (o: { text: string; items: FakeItem[] }) => ({ kind: "Submenu", text: o.text, items: o.items, append: async (i: FakeItem) => void o.items.push(i) }),
  },
  Menu: { new: async (o: { items: FakeItem[] }) => ({ setAsAppMenu: async () => void fake.menus.push(o.items) }) },
}));

const base: ClipboardState = { activeKind: "scene", editableFocus: false, textSelected: false, commandEnabled: true };

describe("네이티브 편집 항목의 갈래", () => {
  it("씬이나 맵 탭, 입력 칸 밖, 글자 선택 없음, 커맨드 켜짐이면 우리 커맨드", () => {
    expect(clipboardRoute(base)).toBe("command");
    expect(clipboardRoute({ ...base, activeKind: "map" })).toBe("command");
  });

  it("입력 칸, 글자 선택, 다른 문서, 꺼진 커맨드는 OS의 글자 편집", () => {
    expect(clipboardRoute({ ...base, editableFocus: true })).toBe("native");
    expect(clipboardRoute({ ...base, activeKind: "map", textSelected: true })).toBe("native");
    for (const kind of ["script", "text", "image", "welcome", null]) expect(clipboardRoute({ ...base, activeKind: kind })).toBe("native");
    expect(clipboardRoute({ ...base, commandEnabled: false })).toBe("native");
  });

  it("잘라내기, 복사, 붙여넣기만 갈린다", () => {
    expect(CLIPBOARD_COMMANDS).toEqual({ "edit.cut": "cut", "edit.copy": "copy", "edit.paste": "paste" });
    expect(toAccelerator("Ctrl+C")).toBe("CmdOrCtrl+C");
    expect(toAccelerator("Ctrl+Alt+M")).toBe("CmdOrCtrl+Alt+M");
  });
});

function deps(route: ClipboardRoute, exec: boolean | Error = true) {
  const calls: string[] = [];
  const d: ClipboardItemDeps = {
    route: () => route,
    execute: async (id) => {
      calls.push(`execute ${id}`);
      return true;
    },
    execCommand: (kind) => {
      calls.push(`execCommand ${kind}`);
      if (exec instanceof Error) throw exec;
      return exec;
    },
    rebuild: () => void calls.push("rebuild"),
  };
  return { d, calls };
}

describe("우리 항목을 눌렀을 때", () => {
  it("그때도 커맨드 쪽이면 커맨드를 부른다", async () => {
    const { d, calls } = deps("command");
    expect(await runClipboardItem("edit.copy", d)).toBe("command");
    expect(calls).toEqual(["execute edit.copy"]);
  });

  it("그 사이 입력 칸으로 갔으면 메뉴를 다시 짓고 글자 편집을 해 본다", async () => {
    const ok = deps("native", true);
    expect(await runClipboardItem("edit.cut", ok.d)).toBe("native");
    expect(ok.calls).toEqual(["rebuild", "execCommand cut"]);
    const blocked = deps("native", false);
    expect(await runClipboardItem("edit.paste", blocked.d)).toBe("blocked");
    const throws = deps("native", new Error("막혔다"));
    expect(await runClipboardItem("edit.copy", throws.d)).toBe("blocked");
    expect(throws.calls).toEqual(["rebuild", "execCommand copy"]);
  });

  it("편집 커맨드가 아니면 던진다", async () => {
    await expect(runClipboardItem("file.save", deps("command").d)).rejects.toThrow(/편집 커맨드 아님: file.save/);
  });
});

describe("초점과 글자 선택 따라가기", () => {
  it("입력 칸에 들어가고 나오는 것과 입력 칸 밖의 글자 선택을 안다", async () => {
    document.body.innerHTML = '<input id="i" /><div id="log">콘솔 한 줄</div><button id="b">단추</button>';
    const watch = watchTextContext(document);
    expect(watch.editable()).toBe(false);
    const input = document.getElementById("i") as HTMLInputElement;
    input.focus();
    expect(watch.editable()).toBe(true);
    (document.getElementById("b") as HTMLButtonElement).focus();
    await new Promise((r) => setTimeout(r, 0));
    expect(watch.editable()).toBe(false);

    const range = document.createRange();
    range.selectNodeContents(document.getElementById("log")!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    expect(watch.selected()).toBe(true);
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(watch.selected()).toBe(false);

    // 뗀 뒤에는 따라가지 않는다
    watch.dispose();
    input.focus();
    expect(watch.editable()).toBe(false);
  });
});

describe("다시 짓기 예약", () => {
  afterEach(() => vi.useRealTimers());

  function scheduler() {
    const builds: number[] = [];
    const errors: string[] = [];
    let release: (() => void) | null = null;
    let hold = false;
    const s = createRebuildScheduler(
      () => {
        builds.push(Date.now());
        if (!hold) return Promise.resolve();
        return new Promise<void>((r) => (release = r));
      },
      (e) => void errors.push(e.message),
    );
    return { s, builds, errors, holdNext: () => (hold = true), release: () => release?.() };
  }

  it("잠깐 모아서 한 번 짓고, 부를 때마다 미룬다", async () => {
    vi.useFakeTimers();
    const { s, builds } = scheduler();
    s.schedule();
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS - 10);
    s.schedule();
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS - 10);
    expect(builds).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10);
    expect(builds).toHaveLength(1);
  });

  it("delay 0은 곧바로이고, 그것이 기다리는 동안의 보통 예약은 거기에 얹힌다", async () => {
    vi.useFakeTimers();
    const { s, builds } = scheduler();
    s.schedule(0);
    s.schedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(builds).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS * 2);
    expect(builds).toHaveLength(1);
    // 보통 예약이 기다리는 중에 delay 0이 오면 앞당긴다
    s.schedule();
    s.schedule(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(builds).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS * 2);
    expect(builds).toHaveLength(2);
  });

  it("짓는 중에 부르면 끝난 뒤 한 번 더 짓고, 실패는 알린다. 뗀 뒤에는 짓지 않는다", async () => {
    vi.useFakeTimers();
    const { s, builds, errors, holdNext, release } = scheduler();
    holdNext();
    const first = s.rebuild();
    expect(builds).toHaveLength(1);
    await s.rebuild();
    expect(builds).toHaveLength(1);
    release();
    await first;
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS);
    expect(builds).toHaveLength(2);

    const failing = createRebuildScheduler(() => Promise.reject(new Error("메뉴 API 오류")), (e) => void errors.push(e.message));
    await failing.rebuild();
    expect(errors).toEqual(["메뉴 API 오류"]);

    s.schedule();
    s.dispose();
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS * 2);
    s.schedule(0);
    await s.rebuild();
    expect(builds).toHaveLength(2);
  });
});

describe("네이티브 메뉴 설치", () => {
  beforeEach(() => {
    // 앞 테스트가 입력 칸에 초점을 남겼을 수 있다
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
    fake.menus.length = 0;
    document.body.innerHTML = "";
  });

  function editorFake() {
    const commands = new CommandRegistry({ platform: "win" });
    const menus = new MenuRegistry();
    const state = observable({ active: null as { kind: string } | null, selected: false });
    const executed: string[] = [];
    for (const [id, label] of [
      ["edit.copy", "복사"],
      ["edit.paste", "붙여넣기"],
    ] as const) {
      commands.register({ id, label, category: "edit", shortcut: id === "edit.copy" ? "Ctrl+C" : "Ctrl+V", enabled: () => state.selected, run: () => void executed.push(id) });
      menus.register({ path: `편집/${label}`, commandId: id });
    }
    const editor = {
      commands,
      menus,
      documents: state,
      log: new LogStore(),
      version: "test",
      commandLabel: (id: string) => commands.get(id)?.label ?? id,
      commandChecked: () => false,
    } as unknown as Editor;
    return { editor, state, commands, menus, executed };
  }

  const copyItem = () => {
    const menu = fake.menus.at(-1) ?? [];
    const edit = menu.find((i) => i.kind === "Submenu" && i.text === "편집");
    return edit?.items?.find((i) => i.text === "복사");
  };

  it("오브젝트를 고른 맵 탭이 되면 곧바로(0ms) 우리 항목으로 바꾸고, 입력 칸에 들어가면 OS 항목으로 되돌린다", async () => {
    vi.useFakeTimers();
    const { editor, state, executed } = editorFake();
    const stop = await installNativeMenu(editor);
    expect(fake.menus).toHaveLength(1);
    expect(copyItem()).toMatchObject({ kind: "Predefined", item: "Copy" });

    runInAction(() => {
      state.active = { kind: "map" };
      state.selected = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.menus).toHaveLength(2);
    expect(copyItem()).toMatchObject({ kind: "MenuItem", id: "edit.copy", enabled: true });
    // 같은 변화로 걸린 보통 예약은 0ms 짓기에 얹혀 따로 돌지 않는다
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS * 2);
    expect(fake.menus).toHaveLength(2);
    copyItem()!.action!();
    await vi.advanceTimersByTimeAsync(0);
    expect(executed).toEqual(["edit.copy"]);

    document.body.innerHTML = '<input id="name" />';
    (document.getElementById("name") as HTMLInputElement).focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.menus).toHaveLength(3);
    expect(copyItem()).toMatchObject({ kind: "Predefined", item: "Copy" });

    stop();
    runInAction(() => (state.active = { kind: "scene" }));
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS * 2);
    expect(fake.menus).toHaveLength(3);
  });

  it("메뉴와 커맨드가 여러 번 바뀌면 모아서 한 번 다시 짓는다", async () => {
    vi.useFakeTimers();
    const { editor, commands, menus } = editorFake();
    const stop = await installNativeMenu(editor);
    commands.register({ id: "map.new", label: "새 맵", category: "map", run: () => {} });
    menus.register({ path: "맵/새 맵", commandId: "map.new" });
    await vi.advanceTimersByTimeAsync(REBUILD_DELAY_MS - 1);
    expect(fake.menus).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.menus).toHaveLength(2);
    expect(fake.menus[1].map((i) => i.text)).toEqual(["편집", "맵"]);
    stop();
  });
});
