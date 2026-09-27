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
