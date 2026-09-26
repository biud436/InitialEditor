import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Debouncer, isReloadPath, SaveReloader, shouldReloadOnSave } from "./reloadOnSave";

describe("isReloadPath", () => {
  it("scripts 와 resources/scenes 와 resources/maps 아래만", () => {
    expect(isReloadPath("scripts/lua/main.lua")).toBe(true);
    expect(isReloadPath("./scripts/ruby/main.rb")).toBe(true);
    expect(isReloadPath("resources/scenes/title.json")).toBe(true);
    expect(isReloadPath("resources/maps/village/inn.json")).toBe(true);
    expect(isReloadPath("resources/images/checker.png")).toBe(false);
    expect(isReloadPath("game.json")).toBe(false);
    expect(isReloadPath("scriptsx/main.lua")).toBe(false);
    expect(isReloadPath(null)).toBe(false);
    expect(isReloadPath("")).toBe(false);
    expect(isReloadPath("../scripts/main.lua")).toBe(false);
  });
});

describe("shouldReloadOnSave", () => {
  const base = { path: "scripts/lua/main.lua", reloadOnSave: true, canSpawn: true, running: true };

  it("설정이 꺼져 있으면 아니다", () => {
    expect(shouldReloadOnSave({ ...base, reloadOnSave: false })).toBe(false);
  });

  it("Tauri(띄울 수 있음)는 실행 중일 때만", () => {
    expect(shouldReloadOnSave(base)).toBe(true);
    expect(shouldReloadOnSave({ ...base, running: false })).toBe(false);
  });

  it("브리지(띄울 수 없음)는 늘 (터미널에서 띄웠을 수 있다)", () => {
    expect(shouldReloadOnSave({ ...base, canSpawn: false, running: false })).toBe(true);
  });

  it("에디터 안 엔진이 돌면 Tauri 의 프로세스가 없어도 늘", () => {
    expect(shouldReloadOnSave({ ...base, running: false, embeddedRunning: true })).toBe(true);
    expect(shouldReloadOnSave({ ...base, reloadOnSave: false, embeddedRunning: true })).toBe(false);
    expect(shouldReloadOnSave({ ...base, path: "resources/images/a.png", embeddedRunning: true })).toBe(false);
  });

  it("보낼 길이 없는 백엔드(웹판)는 게임 탭이 돌 때만", () => {
    expect(shouldReloadOnSave({ ...base, canSpawn: false, running: false, canPush: false })).toBe(false);
    expect(shouldReloadOnSave({ ...base, canSpawn: false, running: false, canPush: false, embeddedRunning: true })).toBe(true);
  });

  it("대상 폴더 밖의 문서는 아니다", () => {
    expect(shouldReloadOnSave({ ...base, path: "resources/images/a.png" })).toBe(false);
    expect(shouldReloadOnSave({ ...base, path: null })).toBe(false);
  });
});

describe("Debouncer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("연속 호출은 마지막 뒤 한 번만", () => {
    const d = new Debouncer(300);
    let calls = 0;
    d.schedule(() => calls++);
    vi.advanceTimersByTime(200);
    d.schedule(() => calls++);
    expect(d.pending).toBe(true);
    vi.advanceTimersByTime(200);
    expect(calls).toBe(0);
    vi.advanceTimersByTime(100);
    expect(calls).toBe(1);
    expect(d.pending).toBe(false);
  });

  it("cancel 하면 부르지 않는다", () => {
    const d = new Debouncer(300);
    let calls = 0;
    d.schedule(() => calls++);
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(0);
  });
});

describe("SaveReloader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(accept = true) {
    const calls: string[][] = [];
    const saver = new SaveReloader({ accepts: (p) => accept && isReloadPath(p), reload: (paths) => void calls.push(paths) }, 300);
    return { saver, calls };
  }

  it("300ms 안의 저장은 모아서 한 번에, 같은 경로는 한 번", () => {
    const { saver, calls } = make();
    saver.onSaved("scripts/lua/main.lua");
    vi.advanceTimersByTime(100);
    saver.onSaved("resources/maps/forest.json");
    vi.advanceTimersByTime(100);
    saver.onSaved("./scripts/lua/main.lua");
    saver.onSaved("resources/scenes/title.json");
    expect(saver.pending).toBe(true);
    vi.advanceTimersByTime(299);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual([["scripts/lua/main.lua", "resources/maps/forest.json", "resources/scenes/title.json"]]);
    // 다음 묶음은 새로 모은다
    saver.onSaved("scripts/lua/title.lua");
    vi.advanceTimersByTime(300);
    expect(calls[1]).toEqual(["scripts/lua/title.lua"]);
  });

  it("대상이 아닌 저장은 모으지 않고, cancel 하면 버린다", () => {
    const { saver, calls } = make();
    saver.onSaved("resources/images/a.png");
    saver.onSaved(null);
    expect(saver.pending).toBe(false);
    saver.onSaved("scripts/lua/main.lua");
    saver.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
    const off = make(false);
    off.saver.onSaved("scripts/lua/main.lua");
    vi.advanceTimersByTime(1000);
    expect(off.calls).toEqual([]);
  });
});
