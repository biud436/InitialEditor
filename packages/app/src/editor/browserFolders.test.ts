// 웹판의 폴더 열기 (browserFolders.ts). 저장하지 않은 문서를 묻는 곳에서 취소하면 기억한 기록과 이 페이지의 핸들이
// 그대로여야 한다: 이름이 같은 두 폴더(a/game, b/game)에서 a 를 연 채 고치고, 폴더 열기로 b 를 고른 뒤 취소한다.

import { FsAccessBackend, HandleStore, MemoryFolderTable, type FolderRecord, type FsDirHandle } from "@initial-editor/backend-fsaccess";
import { describe, expect, it } from "vitest";
import { BrowserFolders } from "./browserFolders";
import type { Editor } from "./Editor";

/** 폴더 핸들 흉내. 기억(remember)은 이름만 본다 */
function folder(name: string, where: string): FsDirHandle {
  return { kind: "directory", name, where } as unknown as FsDirHandle;
}

function setup() {
  let t = 0;
  const table = new MemoryFolderTable();
  let puts = 0;
  const put = table.put.bind(table);
  table.put = (record: FolderRecord, handle?: FsDirHandle) => {
    puts++;
    return put(record, handle);
  };
  const handles = new HandleStore(table, { now: () => ++t, offTheRecord: async () => true });
  const picks: (FsDirHandle | null)[] = [];
  const backend = new FsAccessBackend({ handles, picker: async () => picks.shift() ?? null });
  const state = { open: null as string | null, dirty: false, confirm: false, asked: 0, errors: [] as string[] };
  const editor = {
    backend,
    events: { on: () => () => {} },
    settings: { settings: { recentProjects: [] as string[] }, removeRecentProject: () => {} },
    toasts: { info: () => {}, warn: () => {}, error: (m: string) => state.errors.push(m) },
    log: { error: () => {} },
    /** 저장하지 않은 문서가 있으면 묻는다 (Editor.closeProject 와 같다). 취소면 false */
    async closeProject(): Promise<boolean> {
      if (!state.open) return true;
      if (state.dirty) {
        state.asked++;
        if (!state.confirm) return false;
      }
      state.open = null;
      state.dirty = false;
      return true;
    },
    async replaceBackend(): Promise<boolean> {
      return editor.closeProject();
    },
    async openProject(key: string): Promise<boolean> {
      if (!(await editor.closeProject())) return false;
      state.open = key;
      return true;
    },
  };
  const folders = new BrowserFolders(editor as unknown as Editor);
  return { folders, handles, table, picks, state, puts: () => puts };
}

describe("BrowserFolders.openNew", () => {
  it("저장하지 않은 문서를 묻는 곳에서 취소하면 기억한 기록과 이 페이지의 핸들을 바꾸지 않는다", async () => {
    const { folders, handles, table, picks, state, puts } = setup();
    const a = folder("game", "a");
    const b = folder("game", "b");

    picks.push(a);
    expect(await folders.openNew()).toBe(true);
    const key = state.open!;
    expect(key).toBeTruthy();
    const before = await handles.list();
    expect(before.map((r) => r.name)).toEqual(["game"]);
    expect(handles.opened(key)).toBe(a);
    expect(table.handles.get(key)).toBe(a);

    // a 를 고친 채 b 를 고르고 취소한다
    state.dirty = true;
    const putsBefore = puts();
    picks.push(b);
    expect(await folders.openNew()).toBe(false);
    expect(state.asked).toBe(1);
    expect(state.open).toBe(key);
    expect(state.dirty).toBe(true);
    expect(puts()).toBe(putsBefore);
    expect(await handles.list()).toEqual(before);
    expect(handles.opened(key)).toBe(a);
    expect(table.handles.get(key)).toBe(a);
    expect(folders.records).toEqual(before);

    // 다시 고르고 닫기에 동의하면 같은 기록(같은 이름)이 b 를 가리킨다
    state.confirm = true;
    picks.push(b);
    expect(await folders.openNew()).toBe(true);
    expect(state.asked).toBe(2);
    expect(state.open).toBe(key);
    const after = await handles.list();
    expect(after.map((r) => r.key)).toEqual([key]);
    expect(after[0].openedAt).toBeGreaterThan(before[0].openedAt);
    expect(handles.opened(key)).toBe(b);
    expect(table.handles.get(key)).toBe(b);
    expect(state.errors).toEqual([]);
  });

  it("폴더 고르기를 취소하면 묻지도 기억하지도 않는다", async () => {
    const { folders, handles, picks, state, puts } = setup();
    picks.push(folder("game", "a"));
    expect(await folders.openNew()).toBe(true);
    const key = state.open;
    state.dirty = true;
    const putsBefore = puts();
    picks.push(null);
    expect(await folders.openNew()).toBe(false);
    expect(state.asked).toBe(0);
    expect(state.open).toBe(key);
    expect(puts()).toBe(putsBefore);
    expect((await handles.list()).length).toBe(1);
  });
});
