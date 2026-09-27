import type { Entry, ProjectBackend } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { formatBytes, isStageDir, isStagePath, listStageFiles, MAX_STAGE_BYTES, readStageFiles } from "./staging";

describe("isStagePath", () => {
  it("game.json 과 scripts 와 resources 아래만 올린다", () => {
    expect(isStagePath("game.json")).toBe(true);
    expect(isStagePath("scripts/lua/main.lua")).toBe(true);
    expect(isStagePath("scripts/ruby/main.rb")).toBe(true);
    expect(isStagePath("resources/fonts/hangul.fnt")).toBe(true);
    expect(isStagePath("resources/aldebaran/title.png")).toBe(true);
    expect(isStagePath("README.md")).toBe(false);
    expect(isStagePath("docs/plan.md")).toBe(false);
    expect(isStagePath("scripts")).toBe(false);
    expect(isStagePath("resourcesx/a.png")).toBe(false);
  });

  it("RTP, 원본 그림, 압축과 PSD, 에디터 폴더, git, 숨은 파일은 뺀다", () => {
    expect(isStagePath("resources/rtp/Graphics/a.png")).toBe(false);
    expect(isStagePath("resources/aldebaran/src/gpt/sheet.png")).toBe(false);
    expect(isStagePath("resources/RTP.zip")).toBe(false);
    expect(isStagePath("resources/icons/icon.PSD")).toBe(false);
    expect(isStagePath(".initial-editor/layout.json")).toBe(false);
    expect(isStagePath(".git/HEAD")).toBe(false);
    expect(isStagePath("scripts/.git/config")).toBe(false);
    expect(isStagePath("resources/.DS_Store")).toBe(false);
    expect(isStagePath("../outside/game.json")).toBe(false);
  });

  it("폴더는 뿌리로 가는 길과 뿌리 안만 내려간다", () => {
    expect(isStageDir("scripts/lua")).toBe(true);
    expect(isStageDir("resources/maps")).toBe(true);
    expect(isStageDir("resources/rtp")).toBe(false);
    expect(isStageDir("resources/aldebaran/src")).toBe(false);
    expect(isStageDir("resources/aldebaran")).toBe(true);
    expect(isStageDir(".initial-editor")).toBe(false);
    expect(isStageDir("docs")).toBe(false);
  });
});

/** list 가 알려 주는 크기를 바꾸고 읽기를 기록하는 백엔드 */
function tracked(mem: MemoryBackend, sizes: Record<string, number> = {}) {
  const listed: string[] = [];
  const reads: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const backend = Object.assign(Object.create(mem) as MemoryBackend, {
    async list(rel: string): Promise<Entry[]> {
      listed.push(rel);
      const entries = await mem.list(rel);
      return entries.map((e) => (sizes[e.path] !== undefined ? { ...e, size: sizes[e.path] } : e));
    },
    async readBinary(rel: string): Promise<Uint8Array> {
      reads.push(rel);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return mem.readBinary(rel);
    },
  }) as ProjectBackend;
  return { backend, listed, reads, max: () => maxInFlight };
}

function sampleBackend(): MemoryBackend {
  return new MemoryBackend({
    "game.json": "{}",
    "README.md": "# x",
    "scripts/lua/main.lua": "print(1)",
    "scripts/lua/games/title.lua": "-- t",
    "scripts/ruby/main.rb": "puts 1",
    "resources/fonts/hangul.fnt": "info",
    "resources/audio/bgm.ogg": new Uint8Array([1, 2, 3]),
    "resources/rtp/Graphics/a.png": new Uint8Array([1]),
    "resources/aldebaran/title.png": new Uint8Array([1]),
    "resources/aldebaran/src/gpt/raw.png": new Uint8Array([1]),
    "resources/RTP.zip": new Uint8Array([1]),
    "resources/icons/icon.psd": new Uint8Array([1]),
    "resources/maps/forest.json": "{}",
    "resources/scenes/title.json": "{}",
    ".initial-editor/layout.json": "{}",
  });
}

describe("listStageFiles", () => {
  it("목록을 모으고, 빼는 폴더는 내려가지 않고, 32 MB 를 넘는 파일은 따로 둔다", async () => {
    const mem = sampleBackend();
    await mem.open("/p");
    const t = tracked(mem, { "resources/audio/bgm.ogg": MAX_STAGE_BYTES + 1 });
    const result = await listStageFiles(t.backend);
    expect(result.files.map((f) => f.path)).toEqual([
      "game.json",
      "resources/aldebaran/title.png",
      "resources/fonts/hangul.fnt",
      "resources/maps/forest.json",
      "resources/scenes/title.json",
      "scripts/lua/games/title.lua",
      "scripts/lua/main.lua",
      "scripts/ruby/main.rb",
    ]);
    expect(result.tooLarge.map((f) => f.path)).toEqual(["resources/audio/bgm.ogg"]);
    expect(t.listed).not.toContain("resources/rtp");
    expect(t.listed).not.toContain("resources/aldebaran/src");
    expect(t.listed).not.toContain(".initial-editor");
  });

  it("roots 를 주면 그 폴더만 (핫 리로드), 없는 폴더는 건너뛴다", async () => {
    const mem = sampleBackend();
    await mem.open("/p");
    const result = await listStageFiles(mem, ["scripts", "resources/scenes", "resources/maps", "resources/nothing"]);
    expect(result.files.map((f) => f.path)).toEqual([
      "resources/maps/forest.json",
      "resources/scenes/title.json",
      "scripts/lua/games/title.lua",
      "scripts/lua/main.lua",
      "scripts/ruby/main.rb",
    ]);
  });
});

describe("readStageFiles", () => {
  it("동시에 읽는 수를 제한하고 진행을 알린다", async () => {
    const mem = sampleBackend();
    await mem.open("/p");
    const t = tracked(mem);
    const { files } = await listStageFiles(t.backend);
    const progress: string[] = [];
    const read = await readStageFiles(t.backend, files, { concurrency: 3, onProgress: (d, n) => progress.push(`${d}/${n}`) });
    expect(t.max()).toBeLessThanOrEqual(3);
    expect(t.max()).toBeGreaterThan(1);
    expect(Object.keys(read.files).sort()).toEqual(files.map((f) => f.path).sort());
    expect(new TextDecoder().decode(read.files["scripts/lua/main.lua"])).toBe("print(1)");
    expect(progress[0]).toBe("0/9"); // bgm.ogg 도 들어간다 (크기를 바꾸지 않았다)
    expect(progress.at(-1)).toBe("9/9");
    expect(read.bytes).toBeGreaterThan(0);
  });

  it("읽고 보니 한도를 넘으면 빼고, 못 읽으면 경로를 붙여 던지고, abort 면 멈춘다", async () => {
    const mem = new MemoryBackend({ "scripts/a.lua": "a", "scripts/b.lua": "b" });
    await mem.open("/p");
    const big = Object.assign(Object.create(mem) as MemoryBackend, {
      async readBinary(rel: string) {
        return rel === "scripts/b.lua" ? new Uint8Array(MAX_STAGE_BYTES + 1) : mem.readBinary(rel);
      },
    }) as ProjectBackend;
    const read = await readStageFiles(big, [{ path: "scripts/a.lua" }, { path: "scripts/b.lua" }]);
    expect(Object.keys(read.files)).toEqual(["scripts/a.lua"]);
    expect(read.tooLarge).toEqual(["scripts/b.lua"]);

    await expect(readStageFiles(mem, [{ path: "scripts/missing.lua" }])).rejects.toThrow(/scripts\/missing.lua 을\(를\) 읽지 못했다/);

    const controller = new AbortController();
    controller.abort();
    await expect(readStageFiles(mem, [{ path: "scripts/a.lua" }], { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(6_000_000)).toBe("5.7 MB");
  });
});
