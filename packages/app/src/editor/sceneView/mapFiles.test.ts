import { MemoryBackend } from "@initial-editor/core";
import { describe, expect, it, vi } from "vitest";
import { MapFileCache } from "./mapFiles";

const PATH = "resources/maps/a.json";
const MAP = JSON.stringify({ version: 2, width: 2, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [{ name: "g", data: [0, 0] }] });

async function setup(files: Record<string, string>) {
  const backend = new MemoryBackend(files);
  await backend.open("/p");
  const read = vi.spyOn(backend, "readText");
  return { backend, read, cache: new MapFileCache(() => backend) };
}

describe("씬 뷰의 맵 파일 캐시", () => {
  it("경로마다 한 번 읽어 해석한다", async () => {
    const { cache, read } = await setup({ [PATH]: MAP });
    const [a, b] = await Promise.all([cache.load(PATH), cache.load(PATH)]);
    expect(a).toBe(b);
    expect(a.width).toBe(2);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cache.has(PATH)).toBe(true);
  });

  it("읽지 못하거나 맵 형식이 아니면 거부하고 캐시에 남기지 않는다", async () => {
    const { cache, backend } = await setup({ [PATH]: "{}" });
    await expect(cache.load(PATH)).rejects.toThrow(/모르는 맵 버전/);
    expect(cache.has(PATH)).toBe(false);
    await backend.writeText(PATH, MAP);
    await expect(cache.load(PATH)).resolves.toMatchObject({ width: 2 });
    await expect(cache.load("resources/maps/none.json")).rejects.toThrow();
  });

  it("파일이 바뀌면 버리고 알린다 (캐시에 없던 경로도 알린다)", async () => {
    const { cache, backend, read } = await setup({ [PATH]: MAP });
    const changed: string[] = [];
    cache.events.on("changed", (p) => changed.push(p));
    await cache.load(PATH);
    await backend.writeText(PATH, MAP.replace('"width":2', '"width":1').replace("[0,0]", "[0]"));
    cache.fileChanged(PATH);
    cache.fileChanged("resources/tiles/t.png");
    expect(changed).toEqual([PATH, "resources/tiles/t.png"]);
    expect((await cache.load(PATH)).width).toBe(1);
    expect(read).toHaveBeenCalledTimes(2);
    cache.clear();
    expect(cache.has(PATH)).toBe(false);
  });
});
