import { MemoryBackend } from "@initial-editor/core";
import { describe, expect, it, vi } from "vitest";
import { MapFileCache, MapFileCheck } from "./mapFiles";

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

describe("맵 파일이 있고 맵으로 읽히는지", () => {
  async function check(files: Record<string, string>) {
    const backend = new MemoryBackend(files);
    await backend.open("/p");
    const asked = vi.spyOn(backend, "readText");
    const files2 = new MapFileCheck(() => backend);
    const changed: string[] = [];
    files2.events.on("changed", (p) => changed.push(p));
    return { backend, asked, files: files2, changed };
  }
  const OK = { kind: "ok" };
  const MISSING = { kind: "missing" };

  it("처음 묻는 경로는 모른다고 답하고 확인을 한 번만 보낸다. 답이 오면 알린다", async () => {
    const { files, asked, changed } = await check({ [PATH]: MAP });
    expect(files.status(PATH)).toBeUndefined();
    expect(files.status("resources/maps/none.json")).toBeUndefined();
    expect(files.status(PATH)).toBeUndefined();
    expect(asked).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(changed).toHaveLength(2));
    expect(changed.sort()).toEqual([PATH, "resources/maps/none.json"]);
    expect(files.status(PATH)).toEqual(OK);
    expect(files.problem(PATH)).toBeNull();
    expect(files.status("resources/maps/none.json")).toEqual(MISSING);
    expect(files.problem("resources/maps/none.json")).toEqual(MISSING);
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it("JSON이 아니거나 맵 형식이 아니면 invalid와 이유다. 고치면 ok로 돌아온다", async () => {
    const { files, backend, changed } = await check({ [PATH]: "{ not json", "resources/maps/empty.json": "{}" });
    files.status(PATH);
    files.status("resources/maps/empty.json");
    await vi.waitFor(() => expect(changed).toHaveLength(2));
    expect(files.problem(PATH)).toMatchObject({ kind: "invalid", reason: expect.stringMatching(/^JSON 이 아니다: /) });
    expect(files.problem("resources/maps/empty.json")).toEqual({ kind: "invalid", reason: "모르는 맵 버전이다: undefined (지원: 1, 2)" });
    // 이유가 바뀌어도 알린다
    changed.length = 0;
    await backend.writeText(PATH, "[]");
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(changed).toEqual([PATH]));
    expect(files.problem(PATH)).toEqual({ kind: "invalid", reason: "맵 파일은 객체여야 한다" });
    await backend.writeText(PATH, MAP);
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(OK));
    expect(changed).toEqual([PATH, PATH]);
  });

  it("내용이 같으면 다시 해석하지 않는다 (경로와 내용으로 기억한다)", async () => {
    const { files, backend } = await check({ [PATH]: MAP, "resources/maps/b.json": MAP });
    const spy = vi.spyOn(JSON, "parse");
    // 맵 파일의 내용을 해석한 횟수 (다른 곳의 JSON.parse는 세지 않는다)
    const parse = { calls: () => spy.mock.calls.filter(([text]) => text === MAP || text === "{ not json").length };
    try {
      files.status(PATH);
      await vi.waitFor(() => expect(files.status(PATH)).toEqual(OK));
      expect(parse.calls()).toBe(1);
      // 같은 내용으로 다시 쓰면 읽기는 하지만 해석하지 않는다
      await backend.writeText(PATH, MAP);
      files.fileChanged(PATH);
      await new Promise((r) => setTimeout(r, 0));
      expect(files.status(PATH)).toEqual(OK);
      expect(parse.calls()).toBe(1);
      // 같은 내용이어도 다른 경로는 따로 해석한다
      files.status("resources/maps/b.json");
      await vi.waitFor(() => expect(files.status("resources/maps/b.json")).toEqual(OK));
      expect(parse.calls()).toBe(2);
      // 내용이 바뀌면 해석하고, 깨진 내용도 같은 내용이면 다시 해석하지 않는다
      await backend.writeText(PATH, "{ not json");
      files.fileChanged(PATH);
      await vi.waitFor(() => expect(files.status(PATH)).toMatchObject({ kind: "invalid" }));
      expect(parse.calls()).toBe(3);
      await backend.writeText(PATH, "{ not json");
      files.fileChanged(PATH);
      await new Promise((r) => setTimeout(r, 0));
      expect(parse.calls()).toBe(3);
      // 비우면 잊는다
      files.clear();
      files.status(PATH);
      await vi.waitFor(() => expect(files.status(PATH)).toMatchObject({ kind: "invalid" }));
      expect(parse.calls()).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });

  it("파일이 바뀌면 다시 확인하고 답이 바뀔 때만 알린다. 그동안은 옛 답이다", async () => {
    const { files, backend, changed } = await check({ [PATH]: MAP });
    files.status(PATH);
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(OK));
    changed.length = 0;
    await backend.remove(PATH);
    files.fileChanged(PATH);
    expect(files.status(PATH)).toEqual(OK);
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(MISSING));
    expect(changed).toEqual([PATH]);
    // 고쳐 써도 읽히는 것은 그대로면 알리지 않는다
    await backend.writeText(PATH, MAP);
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(OK));
    await backend.writeText(PATH, MAP.replace('"width":2', '"width":1').replace("[0,0]", "[0]"));
    files.fileChanged(PATH);
    await new Promise((r) => setTimeout(r, 0));
    expect(changed).toEqual([PATH, PATH]);
    // 묻지 않은 경로의 변경은 확인하지 않는다
    files.fileChanged("resources/maps/other.json");
    expect(files.status("resources/maps/other.json")).toBeUndefined();
  });

  it("폴더가 바뀌면 그 아래 경로를 다시 확인한다", async () => {
    const { files, backend } = await check({ [PATH]: MAP });
    files.status(PATH);
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(OK));
    await backend.rename("resources/maps", "resources/maps2");
    files.fileChanged("resources/maps");
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(MISSING));
  });

  it("늦게 온 옛 답은 버리고, 확인하지 못한 경로는 모른다(null)로 두며 문제로 보지 않는다. 비우면 잊는다", async () => {
    const { files, backend, asked } = await check({});
    let answer!: (v: string) => void;
    asked.mockImplementationOnce(() => new Promise<string>((r) => (answer = r)));
    files.status(PATH);
    await backend.writeText(PATH, MAP);
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(OK));
    answer("{ not json");
    await new Promise((r) => setTimeout(r, 0));
    expect(files.status(PATH)).toEqual(OK);

    // 루트 밖은 백엔드가 거부한다: 확인하지 못했다
    expect(files.status("../outside.json")).toBeUndefined();
    await vi.waitFor(() => expect(files.status("../outside.json")).toBeNull());
    expect(files.problem("../outside.json")).toBeNull();

    // 읽기가 다른 까닭으로 실패하면 있는지만 가린다: 있으면 모른다, 없으면 missing
    asked.mockRejectedValueOnce(new Error("읽기 실패"));
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(files.status(PATH)).toBeNull());
    await backend.remove(PATH);
    asked.mockRejectedValueOnce(new Error("읽기 실패"));
    files.fileChanged(PATH);
    await vi.waitFor(() => expect(files.status(PATH)).toEqual(MISSING));

    files.clear();
    const before = asked.mock.calls.length;
    expect(files.status(PATH)).toBeUndefined();
    expect(asked.mock.calls.length).toBe(before + 1);
  });
});
