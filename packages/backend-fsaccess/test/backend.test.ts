// 적합성 한 벌 밖의 브라우저 폴더 규칙: 권한, 폴더 고르기와 기억, OPFS 루트, 옮기기, 기본 1.5초 감시와 self 알림.

import type { ChangeEvent } from "@initial-editor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FsAccessBackend } from "../src/FsAccessBackend";
import { HandleStore, MAX_FOLDERS, MemoryFolderTable, RESTORE_GUARD_KEY, RESTORE_GUARD_TTL_MS, RestoreGuard, type KeyValueStore } from "../src/handleStore";
import type { FsDirHandle } from "../src/types";
import { FakeFs } from "./fakeFs";

function make(fs: FakeFs, picker?: () => Promise<FsDirHandle | null>) {
  const handles = new HandleStore(new MemoryFolderTable());
  const backend = new FsAccessBackend({ handles, picker: picker ?? (async () => fs.root()), opfsRoot: async () => fs.root() });
  return { handles, backend };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("FsAccessBackend", () => {
  it("폴더를 고르면 기억하고 키를 준다. 같은 폴더는 같은 키, 취소는 null", async () => {
    const fs = new FakeFs({ name: "mygame" });
    fs.writeFile("game.json", "{}");
    let pick: FsDirHandle | null = fs.root();
    const { backend, handles } = make(fs, async () => pick);
    const key = await backend.pickFolder();
    expect(key).toBeTruthy();
    expect(await backend.pickFolder()).toBe(key);
    expect((await handles.list()).map((r) => r.name)).toEqual(["mygame"]);
    const info = await backend.open(key!);
    expect(info).toEqual({ root: "mygame", name: "mygame", hasGameJson: true });
    expect(backend.openedRoot).toBe(key);
    pick = null;
    expect(await backend.pickFolder()).toBeNull();
  });

  it("기억하는 폴더는 최근 순이고 MAX_FOLDERS 를 넘으면 오래된 것을 잊는다", async () => {
    let t = 0;
    const handles = new HandleStore(new MemoryFolderTable(), undefined, () => ++t);
    const keys: string[] = [];
    for (let i = 0; i < MAX_FOLDERS + 2; i++) keys.push((await handles.remember(new FakeFs({ name: `g${i}` }).root())).key);
    const list = await handles.list();
    expect(list.length).toBe(MAX_FOLDERS);
    expect(list[0].name).toBe(`g${MAX_FOLDERS + 1}`);
    expect(list.map((r) => r.key)).not.toContain(keys[0]);
    await handles.touch(keys[5]);
    expect((await handles.list())[0].key).toBe(keys[5]);
    await handles.forget(keys[5]);
    expect(await handles.get(keys[5])).toBeUndefined();
  });

  it("목록은 핸들을 꺼내지 않고, 다른 페이지에서 기억한 폴더는 열 때 한 번만 꺼낸다", async () => {
    const fs = new FakeFs({ name: "mygame" });
    const table = new MemoryFolderTable();
    let restored = 0;
    const getHandle = table.getHandle.bind(table);
    table.getHandle = async (key) => (restored++, getHandle(key));
    const key = (await new HandleStore(table).remember(fs.root())).key;
    // 새 페이지: 같은 저장소, 새 HandleStore
    const handles = new HandleStore(table);
    const backend = new FsAccessBackend({ handles });
    expect((await handles.list()).map((r) => r.name)).toEqual(["mygame"]);
    expect(restored).toBe(0);
    await backend.open(key);
    await backend.open(key);
    expect(restored).toBe(1);
    // 이름이 다른 폴더를 고를 때는 기억한 핸들을 꺼내 비교하지 않는다
    await handles.remember(new FakeFs({ name: "other" }).root());
    expect(restored).toBe(1);
  });

  it("핸들을 꺼내다 페이지가 죽은 표시가 남아 있으면 다시 열기를 끄고, 이 페이지에서 고른 폴더는 연다", async () => {
    const kv = new Map<string, string>();
    const storage: KeyValueStore = { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v), removeItem: (k) => void kv.delete(k) };
    const table = new MemoryFolderTable();
    const old = await new HandleStore(table).remember(new FakeFs({ name: "old" }).root());
    // 꺼내는 도중 탭이 죽는다: 끝나지 않는 꺼내기
    table.getHandle = () => new Promise(() => {});
    void new HandleStore(table, new RestoreGuard(storage)).handle(old.key);
    expect(kv.has(RESTORE_GUARD_KEY)).toBe(true);

    const handles = new HandleStore(table, new RestoreGuard(storage));
    const fresh = new FakeFs({ name: "fresh" });
    const backend = new FsAccessBackend({ handles, picker: async () => fresh.root() });
    expect(handles.canRestore(old.key)).toBe(false);
    await expect(backend.open(old.key)).rejects.toMatchObject({ code: "unsupported" });
    const key = (await backend.pickFolder())!;
    expect(handles.canRestore(key)).toBe(true);
    expect((await backend.open(key)).name).toBe("fresh");
    // 표시가 오래되면 무시한다
    const later = new RestoreGuard(storage, () => Date.now() + RESTORE_GUARD_TTL_MS + 1);
    expect(later.crashed).toBe(false);
  });

  it("모르는 키는 not_found", async () => {
    const { backend } = make(new FakeFs());
    await expect(backend.open("folder-nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("권한: 클릭 없이 열면 거부하고, requestAccess(클릭) 뒤에는 열린다", async () => {
    const fs = new FakeFs({ name: "locked", permission: { state: "prompt", answer: "granted" } });
    const { backend } = make(fs);
    const key = (await backend.pickFolder())!;
    await expect(backend.open(key)).rejects.toMatchObject({ code: "io" });
    fs.permission!.gesture = true;
    expect(await backend.requestAccess(key)).toBe(true);
    fs.permission!.gesture = false;
    expect((await backend.open(key)).name).toBe("locked");
  });

  it("권한을 거절하면 requestAccess 는 false", async () => {
    const fs = new FakeFs({ permission: { state: "prompt", answer: "denied", gesture: true } });
    const { backend } = make(fs);
    const key = (await backend.pickFolder())!;
    expect(await backend.requestAccess(key)).toBe(false);
    await expect(backend.open(key)).rejects.toMatchObject({ code: "io" });
  });

  it("OPFS: opfs 는 루트, opfs:<폴더> 는 하위 폴더를 만들어 연다. 루트 밖은 거부", async () => {
    const fs = new FakeFs({ name: "" });
    const { backend } = make(fs);
    expect((await backend.open("opfs")).name).toBe("OPFS");
    const info = await backend.open("opfs:tests/e2e");
    expect(info.name).toBe("e2e");
    await backend.writeText("game.json", "{}");
    expect(fs.readFile("tests/e2e/game.json")).toBe("{}");
    await expect(backend.open("opfs:../x")).rejects.toMatchObject({ code: "outside_root" });
  });

  it.each([
    ["move 없음", false],
    ["move 실패", "fail"],
    ["move 있음", true],
  ] as const)("폴더 옮기기 (%s): 안의 파일까지 옮기고 원래 자리는 없다", async (_label, move) => {
    const fs = new FakeFs({ move });
    fs.writeFile("resources/maps/a.json", "{\"a\":1}");
    fs.writeFile("resources/maps/sub/b.json", "{}");
    const { backend } = make(fs);
    await backend.open((await backend.pickFolder())!);
    await backend.rename("resources/maps", "resources/levels");
    expect(fs.readFile("resources/levels/a.json")).toBe("{\"a\":1}");
    expect(fs.readFile("resources/levels/sub/b.json")).toBe("{}");
    expect(await backend.exists("resources/maps")).toBe(false);
    await backend.writeText("x.lua", "1");
    await expect(backend.rename("x.lua", "resources/levels/a.json")).rejects.toMatchObject({ code: "io" });
    await expect(backend.rename("resources", "resources/levels/inner")).rejects.toMatchObject({ code: "io" });
  });

  it("쓰기는 뷰의 바이트만 쓰고, 종류가 다른 자리에 쓰면 io", async () => {
    const fs = new FakeFs();
    const { backend } = make(fs);
    await backend.open((await backend.pickFolder())!);
    const big = new Uint8Array([9, 1, 2, 3, 9]);
    await backend.writeBinary("bin/x.bin", big.subarray(1, 4));
    expect(Array.from(await backend.readBinary("bin/x.bin"))).toEqual([1, 2, 3]);
    await expect(backend.writeText("bin", "x")).rejects.toMatchObject({ code: "io" });
    await expect(backend.list("bin/x.bin")).rejects.toMatchObject({ code: "io" });
  });

  it("핫 리로드와 엔진 실행은 unsupported", async () => {
    const fs = new FakeFs();
    const { backend } = make(fs);
    await backend.open((await backend.pickFolder())!);
    await expect(backend.hmrPush([])).rejects.toMatchObject({ code: "unsupported" });
    await expect(backend.run({ exe: "x", cwd: "x" })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("내가 쓴 것은 바로 self 로 알리고 (새 폴더도), 폴링이 다시 알리지 않는다", async () => {
    const fs = new FakeFs();
    fs.writeFile("game.json", "{}");
    const { backend } = make(fs);
    await backend.open((await backend.pickFolder())!);
    await backend.list("");
    const seen: ChangeEvent[] = [];
    backend.watch((e) => seen.push(e));
    await backend.writeText("scripts/lua/main.lua", "a");
    await backend.writeText("scripts/lua/main.lua", "b");
    expect(seen.map((e) => `${e.kind}:${e.path}:${e.origin}`)).toEqual([
      "create:scripts:self",
      "create:scripts/lua:self",
      "create:scripts/lua/main.lua:self",
      "modify:scripts/lua/main.lua:self",
    ]);
    seen.length = 0;
    await backend.pollNow();
    await backend.pollNow();
    expect(seen).toEqual([]);
    await backend.remove("scripts");
    await backend.pollNow();
    expect(seen.map((e) => `${e.kind}:${e.path}:${e.origin}`)).toEqual(["delete:scripts:self"]);
    await backend.close();
  });

  it("기본 간격 1.5초: 펼친 폴더와 읽은 파일의 밖 변경을 external 로 알린다. 닫으면 멈춘다", async () => {
    vi.useFakeTimers();
    const fs = new FakeFs();
    fs.writeFile("game.json", "{}");
    fs.writeFile("scripts/lua/main.lua", "a");
    fs.writeFile("resources/maps/forest.json", "{}");
    const { backend } = make(fs);
    await backend.open((await backend.pickFolder())!);
    await backend.list("scripts/lua");
    await backend.readText("resources/maps/forest.json");
    const seen: ChangeEvent[] = [];
    backend.watch((e) => seen.push(e));

    fs.writeFile("scripts/lua/new.lua", "n");
    fs.writeFile("resources/maps/forest.json", "{\"w\":1}");
    fs.writeFile("resources/maps/other.json", "{}");
    await vi.advanceTimersByTimeAsync(1400);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(seen.map((e) => `${e.kind}:${e.path}:${e.origin}`).sort()).toEqual([
      "create:scripts/lua/new.lua:external",
      "modify:resources/maps/forest.json:external",
    ]);

    await backend.close();
    seen.length = 0;
    fs.writeFile("scripts/lua/after.lua", "x");
    await vi.advanceTimersByTimeAsync(5000);
    expect(seen).toEqual([]);
    await expect(backend.readText("game.json")).rejects.toMatchObject({ code: "not_open" });
  });
});
