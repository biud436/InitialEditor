import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MemorySettingsStorage, SettingsStore, type EditorSettings } from "./settings";

describe("SettingsStore 실행 방식", () => {
  it("기본은 process 이고 embedded 로 바꾸면 저장된다", async () => {
    const storage = new MemorySettingsStorage();
    const store = new SettingsStore(storage);
    expect(DEFAULT_SETTINGS.runMode).toBe("process");
    expect(store.settings.runMode).toBe("process");
    store.update({ runMode: "embedded" });
    await Promise.resolve();
    expect(storage.data?.runMode).toBe("embedded");
  });

  it("모르는 값은 기본으로 되돌린다 (손으로 고친 설정 파일)", async () => {
    const storage = new MemorySettingsStorage();
    storage.data = { runMode: "wasm" as EditorSettings["runMode"] };
    const store = new SettingsStore(storage);
    await store.load();
    expect(store.settings.runMode).toBe("process");
  });
});

describe("SettingsStore 엔진 신뢰", () => {
  it("기본은 비어 있고, 남긴 답은 저장소에 쓰이고, 지우면 사라진다", async () => {
    const storage = new MemorySettingsStorage();
    const store = new SettingsStore(storage);
    expect(DEFAULT_SETTINGS.engineTrust).toEqual({});
    expect(store.settings.engineTrust).toEqual({});
    store.setEngineTrust("/home/u/Initial2D", { allow: true, exes: ["/home/u/Initial2D/build/Initial2D"] });
    await Promise.resolve();
    expect(storage.data?.engineTrust).toEqual({ "/home/u/Initial2D": { allow: true, exes: ["/home/u/Initial2D/build/Initial2D"] } });
    store.setEngineTrust("/home/u/game", { allow: false, exes: ["/home/u/Initial2D/build/Initial2D"] });
    store.clearEngineTrust("/home/u/Initial2D");
    await Promise.resolve();
    expect(Object.keys(storage.data?.engineTrust ?? {})).toEqual(["/home/u/game"]);
    // 없는 것을 지우면 저장하지 않는다
    storage.data = null;
    store.clearEngineTrust("/nope");
    await Promise.resolve();
    expect(storage.data).toBeNull();
  });

  it("손으로 고친 설정 파일의 틀린 항목은 버린다", async () => {
    const storage = new MemorySettingsStorage();
    storage.data = {
      engineTrust: {
        "/ok": { allow: true, exes: ["/ok/build/Initial2D", 3, ""] },
        "/no-allow": { exes: [] },
        "/no-exes": { allow: true },
        "/null": null,
      } as unknown as EditorSettings["engineTrust"],
    };
    const store = new SettingsStore(storage);
    await store.load();
    expect(store.settings.engineTrust).toEqual({ "/ok": { allow: true, exes: ["/ok/build/Initial2D"] } });
    storage.data = { engineTrust: ["/x"] as unknown as EditorSettings["engineTrust"] };
    await store.load();
    expect(store.settings.engineTrust).toEqual({});
  });
});

describe("SettingsStore 언어 서버", () => {
  it("기본은 켜져 있고 진단은 규칙 전체다. 바꾸면 저장된다", async () => {
    const storage = new MemorySettingsStorage();
    const store = new SettingsStore(storage);
    expect(store.settings.languageServer).toBe(true);
    expect(store.settings.scriptDiagnostics).toBe("rules");
    store.update({ languageServer: false, scriptDiagnostics: "syntax" });
    await Promise.resolve();
    expect(storage.data).toMatchObject({ languageServer: false, scriptDiagnostics: "syntax" });
  });

  it("손으로 고친 설정 파일의 틀린 값은 기본으로 되돌린다", async () => {
    const storage = new MemorySettingsStorage();
    storage.data = { languageServer: "yes" as unknown as boolean, scriptDiagnostics: "all" as EditorSettings["scriptDiagnostics"] };
    const store = new SettingsStore(storage);
    await store.load();
    expect(store.settings.languageServer).toBe(true);
    expect(store.settings.scriptDiagnostics).toBe("rules");
  });
});
