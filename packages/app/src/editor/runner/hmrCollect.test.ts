import { MemoryBackend } from "@initial-editor/core/testing";
import { decodeUtf8 } from "@initial-editor/core";
import { describe, expect, it } from "vitest";
import { collectHmrFiles, collectHmrPaths } from "./hmrCollect";

// Tauri 모드의 묶음 수집을 메모리 백엔드로 검사한다. 규칙은 hmrCollect.ts 머리 주석.
function project(extra: Record<string, string | Uint8Array> = {}): MemoryBackend {
  return new MemoryBackend({
    "game.json": "{}",
    "scripts/lua/main.lua": "print('main')",
    "scripts/lua/games/flappy.lua": "print('flappy')",
    "scripts/ruby/main.rb": "puts 'main'",
    "scripts/lua/.hidden/skip.lua": "print('hidden')",
    "scripts/lua/notes.txt": "메모",
    "resources/images/checker.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    "resources/scenes/title.json": '{"version":1}',
    "resources/maps/village/inn.json": '{"version":2}',
    "resources/maps/readme.md": "맵 설명",
    ...extra,
  });
}

describe("collectHmrPaths", () => {
  it("scripts 의 .lua 와 .rb, resources/scenes 와 resources/maps 의 .json 만 (정렬, 숨김 폴더 제외)", async () => {
    const backend = project();
    await backend.open("/proj");
    expect(await collectHmrPaths(backend)).toEqual([
      "resources/maps/village/inn.json",
      "resources/scenes/title.json",
      "scripts/lua/games/flappy.lua",
      "scripts/lua/main.lua",
      "scripts/ruby/main.rb",
    ]);
  });

  it("씬과 맵 폴더가 없어도 된다", async () => {
    const backend = new MemoryBackend({ "scripts/lua/main.lua": "print(1)" });
    await backend.open("/proj");
    expect(await collectHmrPaths(backend)).toEqual(["scripts/lua/main.lua"]);
  });

  it("scripts 가 없으면 빈 묶음", async () => {
    const backend = new MemoryBackend({ "game.json": "{}" });
    await backend.open("/proj");
    expect(await collectHmrPaths(backend)).toEqual([]);
    expect(await collectHmrFiles(backend)).toEqual([]);
  });
});

describe("collectHmrFiles", () => {
  it("파일을 바이너리로 읽어 경로와 짝짓는다 (.png 는 들어가지 않는다)", async () => {
    const backend = project();
    await backend.open("/proj");
    const files = await collectHmrFiles(backend, { concurrency: 2 });
    expect(files.map((f) => f.path)).toEqual(await collectHmrPaths(backend));
    expect(files.some((f) => f.path.endsWith(".png"))).toBe(false);
    const main = files.find((f) => f.path === "scripts/lua/main.lua")!;
    expect(main.data).toBeInstanceOf(Uint8Array);
    expect(decodeUtf8(main.data)).toBe("print('main')");
    const scene = files.find((f) => f.path === "resources/scenes/title.json")!;
    expect(decodeUtf8(scene.data)).toBe('{"version":1}');
  });

  it("읽기 동시 수를 제한한다", async () => {
    const backend = project();
    await backend.open("/proj");
    let inFlight = 0;
    let peak = 0;
    const original = backend.readBinary.bind(backend);
    backend.readBinary = async (rel: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      const data = await original(rel);
      inFlight--;
      return data;
    };
    const files = await collectHmrFiles(backend, { concurrency: 2 });
    expect(files).toHaveLength(5);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
