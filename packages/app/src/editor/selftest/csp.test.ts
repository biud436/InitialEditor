import { MemorySettingsStorage, SettingsStore, type SettingsStorage } from "@initial-editor/core";
import { describe, expect, it, vi } from "vitest";
import { installCspCollector, toViolation } from "./csp";
import { chooseStorage, isolatedStorage, MemoryKeyValueStorage } from "./index";

describe("CSP 위반 모으기", () => {
  it("securitypolicyviolation 사건을 모으고 멈추면 더 받지 않는다", () => {
    const target = new EventTarget();
    const csp = installCspCollector(target);
    const e = Object.assign(new Event("securitypolicyviolation"), {
      effectiveDirective: "script-src",
      blockedURI: "eval",
      sourceFile: "tauri://localhost/assets/index.js",
      lineNumber: 12,
      sample: "new Function",
    });
    target.dispatchEvent(e);
    expect(csp.list).toEqual([{ directive: "script-src", blocked: "eval", source: "tauri://localhost/assets/index.js", line: 12, sample: "new Function" }]);
    csp.stop();
    target.dispatchEvent(e);
    expect(csp.list).toHaveLength(1);
  });

  it("빈 칸은 알아볼 수 있는 값으로", () => {
    expect(toViolation({ violatedDirective: "style-src" })).toEqual({ directive: "style-src", blocked: "(inline)", source: null, line: null, sample: null });
  });
});

describe("자가 검사의 격리", () => {
  it("계획이 있으면 평소 설정 저장소를 만들지도 않고, 최근 프로젝트는 메모리에만 남는다", async () => {
    const real: SettingsStorage = { load: vi.fn(async () => ({ recentProjects: ["/Users/u/game"], enginePath: "/opt/Initial2D" })), save: vi.fn(async () => {}) };
    const create = vi.fn(() => real);
    const chosen = chooseStorage({ version: 1 }, create);
    expect(create).not.toHaveBeenCalled();
    expect(chosen.storage).toBeInstanceOf(MemorySettingsStorage);
    expect(chosen.local).toBeInstanceOf(MemoryKeyValueStorage);
    const store = new SettingsStore(chosen.storage);
    await store.load();
    // 사용자의 엔진 경로와 최근 프로젝트를 읽지 않는다 (앱에 든 엔진이 이기게)
    expect(store.settings.enginePath).toBe("");
    expect(store.settings.recentProjects).toEqual([]);
    store.addRecentProject("/tmp/i2d-selftest/flappy-lua");
    await Promise.resolve();
    expect(real.save).not.toHaveBeenCalled();
    expect(real.load).not.toHaveBeenCalled();
  });

  it("계획이 없으면 평소 저장소", () => {
    const real: SettingsStorage = { load: async () => null, save: async () => {} };
    expect(chooseStorage(null, () => real)).toEqual({ storage: real });
  });

  it("레이아웃 저장소는 페이지 안에서만 산다", () => {
    const { local } = isolatedStorage();
    local.setItem("initial-editor.layout", "{}");
    expect(local.getItem("initial-editor.layout")).toBe("{}");
    expect(isolatedStorage().local.getItem("initial-editor.layout")).toBeNull();
  });
});
