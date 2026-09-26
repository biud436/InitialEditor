import { MemoryBackend } from "@initial-editor/core";
import { describe, expect, it, vi } from "vitest";
import { MapFileCache, MapFileExistence } from "./mapFiles";

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

describe("맵 파일이 있는지", () => {
  async function existence(files: Record<string, string>) {
    const backend = new MemoryBackend(files);
    await backend.open("/p");
    const asked = vi.spyOn(backend, "exists");
    const files2 = new MapFileExistence(() => backend);
    const changed: string[] = [];
    files2.events.on("changed", (p) => changed.push(p));
    return { backend, asked, files: files2, changed };
  }

  it("처음 묻는 경로는 모른다고 답하고 확인을 한 번만 보낸다. 답이 오면 알린다", async () => {
    const { files, asked, changed } = await existence({ [PATH]: MAP });
    expect(files.exists(PATH)).toBeUndefined();
    expect(files.exists("resources/maps/none.json")).toBeUndefined();
    expect(files.exists(PATH)).toBeUndefined();
    expect(asked).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(changed).toHaveLength(2));
    expect(changed.sort()).toEqual([PATH, "resources/maps/none.json"]);
    expect(files.exists(PATH)).toBe(true);
    expect(files.exists("resources/maps/none.json")).toBe(false);
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it("파일이 바뀌면 다시 확인하고 답이 바뀔 때만 알린다. 그동안은 옛 답이다", async () => {
    const { files, backend, changed } = await existence({ [PATH]: MAP });
    files.exists(PATH);
    await vi.waitFor(() => expect(files.exists(PATH)).toBe(true));
    changed.length = 0;
    await backend.remove(PATH);
    files.fileChanged(PATH);
    expect(files.exists(PATH)).toBe(true);
    await vi.waitFor(() => expect(files.exists(PATH)).toBe(false));
    expect(changed).toEqual([PATH]);
    // 고쳐 써도 있는 것은 그대로면 알리지 않는다
    await backend.writeText(PATH, MAP);
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(files.exists(PATH)).toBe(true));
    await backend.writeText(PATH, MAP);
    files.fileChanged(PATH);
    await new Promise((r) => setTimeout(r, 0));
    expect(changed).toEqual([PATH, PATH]);
    // 묻지 않은 경로의 변경은 확인하지 않는다
    files.fileChanged("resources/maps/other.json");
    expect(files.exists("resources/maps/other.json")).toBeUndefined();
  });

  it("폴더가 바뀌면 그 아래 경로를 다시 확인한다", async () => {
    const { files, backend } = await existence({ [PATH]: MAP });
    files.exists(PATH);
    await vi.waitFor(() => expect(files.exists(PATH)).toBe(true));
    await backend.rename("resources/maps", "resources/maps2");
    files.fileChanged("resources/maps");
    await vi.waitFor(() => expect(files.exists(PATH)).toBe(false));
  });

  it("늦게 온 옛 답은 버리고, 확인하지 못한 경로는 모른다로 둔다. 비우면 잊는다", async () => {
    const { files, backend, asked } = await existence({});
    let answer!: (v: boolean) => void;
    asked.mockImplementationOnce(() => new Promise<boolean>((r) => (answer = r)));
    files.exists(PATH);
    await backend.writeText(PATH, MAP);
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(files.exists(PATH)).toBe(true));
    answer(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(files.exists(PATH)).toBe(true);

    // 루트 밖은 백엔드가 거부한다: 모른다
    expect(files.exists("../outside.json")).toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(files.exists("../outside.json")).toBeUndefined();

    files.clear();
    const before = asked.mock.calls.length;
    expect(files.exists(PATH)).toBeUndefined();
    expect(asked.mock.calls.length).toBe(before + 1);
  });
});
