// 엔진 명령 래퍼의 인자 이름 (Tauri 는 camelCase 인자를 Rust 의 snake_case 로 옮긴다: timeoutMs → timeout_ms)
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<[string, unknown]> = [];
let reply: unknown = null;
let failure: unknown = null;
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: unknown) => {
    calls.push([cmd, args]);
    if (failure) throw failure;
    return reply;
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: async () => null }));

const { engineBundled, engineExists, engineFeatures } = await import("./index");

beforeEach(() => {
  calls.length = 0;
  reply = null;
  failure = null;
});

describe("엔진 명령", () => {
  it("engine_features 는 시간 제한을 timeoutMs 로, 없으면 null 로 넘긴다", async () => {
    reply = ["lua", "mruby"];
    expect(await engineFeatures("/e/Initial2D")).toEqual(["lua", "mruby"]);
    await engineFeatures("/e/Initial2D", { timeoutMs: 15_000 });
    expect(calls).toEqual([
      ["engine_features", { exe: "/e/Initial2D", timeoutMs: null }],
      ["engine_features", { exe: "/e/Initial2D", timeoutMs: 15_000 }],
    ]);
  });

  it("engine_exists 는 경로 목록을, engine_bundled 는 인자 없이", async () => {
    reply = [true, false];
    expect(await engineExists(["/a", "/b"])).toEqual([true, false]);
    reply = null;
    expect(await engineBundled()).toBeNull();
    expect(calls).toEqual([
      ["engine_exists", { paths: ["/a", "/b"] }],
      ["engine_bundled", undefined],
    ]);
  });

  it("셸의 오류는 core 의 BackendError 로", async () => {
    failure = { code: "engine_not_found", message: "엔진 실행 파일이 없다: /x", path: "/x" };
    await expect(engineFeatures("/x")).rejects.toMatchObject({ code: "engine_not_found", path: "/x" });
  });
});
