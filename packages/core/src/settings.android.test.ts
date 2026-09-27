// 안드로이드 스테이징 설정 (E6 6.3): 엔진 저장소 경로와 허용한 스테이징 스크립트
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MemorySettingsStorage, SettingsStore, type EditorSettings } from "./settings";

describe("SettingsStore 안드로이드 스테이징", () => {
  it("엔진 저장소 경로는 기본이 비어 있고 바꾸면 저장된다", async () => {
    const storage = new MemorySettingsStorage();
    const store = new SettingsStore(storage);
    expect(DEFAULT_SETTINGS.engineRepoPath).toBe("");
    expect(store.settings.engineRepoPath).toBe("");
    store.update({ engineRepoPath: "/home/u/Initial2D" });
    await Promise.resolve();
    expect(storage.data?.engineRepoPath).toBe("/home/u/Initial2D");
  });

  it("허용한 스크립트는 프로젝트별로 저장되고 틀린 모양은 버린다", async () => {
    const storage = new MemorySettingsStorage();
    const store = new SettingsStore(storage);
    expect(store.settings.androidTrust).toEqual({});
    store.update({ androidTrust: { "/home/u/game": { allow: true, exes: ["/home/u/Initial2D/android/prepare_assets.sh"] } } });
    await Promise.resolve();
    expect(storage.data?.androidTrust).toEqual({ "/home/u/game": { allow: true, exes: ["/home/u/Initial2D/android/prepare_assets.sh"] } });
    storage.data = {
      engineRepoPath: 42 as unknown as string,
      androidTrust: { "/ok": { allow: true, exes: ["/s.sh", 1] }, "/bad": { exes: [] } } as unknown as EditorSettings["androidTrust"],
    };
    await store.load();
    expect(store.settings.engineRepoPath).toBe("");
    expect(store.settings.androidTrust).toEqual({ "/ok": { allow: true, exes: ["/s.sh"] } });
  });

  it("엔진 신뢰와 섞이지 않는다", () => {
    const store = new SettingsStore(new MemorySettingsStorage());
    store.update({ androidTrust: { "/p": { allow: true, exes: ["/r/android/prepare_assets.sh"] } } });
    expect(store.settings.engineTrust).toEqual({});
    // 기본값 객체를 고치지 않는다
    expect(DEFAULT_SETTINGS.androidTrust).toEqual({});
  });
});
