import { LogStore, Project } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { parseMap, serializeMap } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import {
  buildNewMap,
  createMapFile,
  listMapPaths,
  listTilesetImages,
  mapIdOf,
  nextMapId,
  parseLayerNames,
  pngSize,
  readImageSize,
  tilesetColumns,
  validateMapName,
  validateMapTiles,
  validateTileSize,
  type NewMapHost,
  type NewMapSpec,
} from "./newMap";
import { encodePng } from "./sampleMap";

const png = (w: number, h: number) => encodePng(w, h, new Uint8Array(w * h * 4));

const SPEC: NewMapSpec = {
  name: "stage1",
  width: 4,
  height: 3,
  tileSize: 16,
  tileset: { image: "resources/tiles/meadow16.png", columns: 8 },
  layers: ["ground", "deco"],
  collision: true,
};

describe("PNG 머리", () => {
  it("폭과 높이를 읽는다", () => {
    expect(pngSize(png(128, 64))).toEqual({ width: 128, height: 64 });
    expect(pngSize(png(1, 300))).toEqual({ width: 1, height: 300 });
  });

  it("PNG가 아니거나 짧거나 IHDR가 아니면 null", () => {
    expect(pngSize(new Uint8Array(10))).toBeNull();
    expect(pngSize(new TextEncoder().encode("GIF89a".padEnd(40, " ")))).toBeNull();
    const broken = png(8, 8);
    broken[12] = "X".charCodeAt(0);
    expect(pngSize(broken)).toBeNull();
    // 바이트 배열이 큰 버퍼의 가운데를 가리켜도 읽는다
    const inner = png(20, 10);
    const outer = new Uint8Array(inner.length + 7);
    outer.set(inner, 7);
    expect(pngSize(outer.subarray(7))).toEqual({ width: 20, height: 10 });
  });

  it("백엔드로 읽고, PNG가 아니면 이유를 던진다", async () => {
    const be = new MemoryBackend({ "resources/tiles/a.png": png(96, 48), "resources/tiles/b.png": "글자" });
    await be.open("/mem");
    expect(await readImageSize(be, "resources/tiles/a.png")).toEqual({ width: 96, height: 48 });
    await expect(readImageSize(be, "resources/tiles/b.png")).rejects.toThrow(/PNG가 아니다: resources\/tiles\/b.png/);
  });
});

describe("입력 검사", () => {
  it("이름: 빈 것, 확장자, 폴더와 기호, 이미 있는 것(대소문자 무시)", () => {
    const existing = ["resources/maps/Forest.json"];
    expect(validateMapName("", existing)).toBe("이름을 적는다");
    expect(validateMapName("a.json", existing)).toMatch(/확장자/);
    expect(validateMapName("sub/a", existing)).toMatch(/폴더 없이/);
    expect(validateMapName("a b", existing)).toMatch(/글자, 숫자/);
    expect(validateMapName("forest", existing)).toBe("이미 있다: resources/maps/forest.json");
    expect(validateMapName(" 숲_2-a ", existing)).toBeNull();
  });

  it("크기와 타일 크기: 정수이고 범위 안", () => {
    expect(validateMapTiles("20", "폭은")).toBeNull();
    expect(validateMapTiles("1024", "폭은")).toBeNull();
    expect(validateMapTiles("0", "폭은")).toBe("폭은 1 이상 1024 이하다");
    expect(validateMapTiles("1025", "높이는")).toBe("높이는 1 이상 1024 이하다");
    expect(validateMapTiles("2.5", "폭은")).toBe("폭은 정수다");
    expect(validateMapTiles("", "폭은")).toMatch(/정수다/);
    expect(validateMapTiles("-3", "폭은")).toMatch(/정수다/);
    expect(validateTileSize("16")).toBeNull();
    expect(validateTileSize("x")).toBe("타일 크기는 정수다");
    expect(validateTileSize("300")).toBe("타일 크기는 1 이상 256 이하다");
  });

  it("레이어 이름: 쉼표로 가르고 빈 것은 버린다, 하나 이상, 겹치지 않게", () => {
    expect(parseLayerNames(" ground, deco ,,over ")).toEqual({ names: ["ground", "deco", "over"], error: null });
    expect(parseLayerNames(" , ").error).toBe("레이어를 하나 이상 적는다");
    expect(parseLayerNames("a, b, a").error).toBe("레이어 이름이 겹친다: a");
  });

  it("타일셋 열 수는 그림 폭을 타일 크기로 나눈 몫", () => {
    expect(tilesetColumns(128, 16)).toBe(8);
    expect(tilesetColumns(130, 16)).toBe(8);
    expect(tilesetColumns(8, 16)).toBe(0);
    expect(tilesetColumns(128, 0)).toBe(0);
  });
});

describe("새 맵 데이터", () => {
  it("빈 칸의 레이어, 통행, 타일셋 하나, 고정 형식 v2", () => {
    const data = buildNewMap(SPEC, 12);
    expect(data).toMatchObject({ version: 2, name: "stage1", id: 12, width: 4, height: 3, tileWidth: 16, tileHeight: 16, events: null, objects: [] });
    expect(data.layers.map((l) => [l.name, l.data.length, l.data.every((v) => v === 0)])).toEqual([
      ["ground", 12, true],
      ["deco", 12, true],
    ]);
    expect(data.collision).toEqual(new Array(12).fill(0));
    expect(data.tilesets).toEqual([{ image: "resources/tiles/meadow16.png", firstGid: 1, columns: 8, extra: {} }]);
    const text = serializeMap(data);
    expect(text).toContain('      "data": [\n        0,0,0,0,\n        0,0,0,0,\n        0,0,0,0\n      ]');
    expect(serializeMap(parseMap(text))).toBe(text);
  });

  it("통행을 끄면 collision이 없다. 타일셋은 늘 하나다 (엔진은 tilesets가 빈 맵을 읽지 않는다)", () => {
    const data = buildNewMap({ ...SPEC, collision: false, layers: ["only"] });
    expect(data.collision).toBeNull();
    expect(data.tilesets).toEqual([{ image: "resources/tiles/meadow16.png", firstGid: 1, columns: 8, extra: {} }]);
    const back = JSON.parse(serializeMap(data));
    expect(Object.keys(back)).toEqual(["version", "name", "id", "width", "height", "tileWidth", "tileHeight", "layers", "tilesets"]);
  });
});

async function project(files: Record<string, string | Uint8Array>) {
  const be = new MemoryBackend({ "game.json": "{}", ...files });
  const p = new Project(be);
  await p.open("/mem");
  const log = new LogStore();
  const toasts: string[] = [];
  const revealed: string[] = [];
  const host: NewMapHost = {
    backend: be,
    project: p,
    tree: { reveal: async (path) => void revealed.push(path) },
    log,
    toasts: { warn: (t) => toasts.push(`warn: ${t}`), error: (t) => toasts.push(`error: ${t}`) },
  };
  return { be, host, log, toasts, revealed };
}

describe("프로젝트 파일", () => {
  it("resources 아래의 PNG만 타일셋 후보이고, 맵 목록은 resources/maps의 json", async () => {
    const { be } = await project({
      "resources/tiles/a.png": png(16, 16),
      "resources/images/deep/b.PNG": png(16, 16),
      "resources/images/c.jpg": "x",
      "scripts/d.png": png(16, 16),
      "resources/maps/one.json": "{}",
      "resources/maps/notes.txt": "x",
      "resources/maps/sub/two.json": "{}",
    });
    expect(await listTilesetImages(be)).toEqual(["resources/images/deep/b.PNG", "resources/tiles/a.png"]);
    expect(await listMapPaths(be)).toEqual(["resources/maps/one.json"]);
    const empty = await project({});
    expect(await listMapPaths(empty.be)).toEqual([]);
    expect(await listTilesetImages(empty.be)).toEqual([]);
  });

  it("다음 맵 id는 있는 것 중 가장 큰 것 + 1, 읽지 못한 것은 건너뛴다", async () => {
    expect(mapIdOf('{\n  "version": 2,\n  "name": "a",\n  "id": 101,')).toBe(101);
    expect(mapIdOf('{ "version": 2 }')).toBeNull();
    const { be } = await project({ "resources/maps/a.json": '{ "id": 7 }', "resources/maps/b.json": '{ "id": 12 }', "resources/maps/c.json": "깨짐" });
    expect(await nextMapId(be, ["resources/maps/a.json", "resources/maps/b.json", "resources/maps/c.json", "resources/maps/없음.json"])).toBe(13);
    expect(await nextMapId(be, [])).toBe(1);
  });

  it("맵 파일을 쓰고 트리에서 보이고 기록을 남긴다", async () => {
    const { be, host, log, revealed } = await project({ "resources/maps/old.json": '{\n  "version": 2,\n  "id": 4\n}' });
    const path = await createMapFile(host, SPEC);
    expect(path).toBe("resources/maps/stage1.json");
    const saved = parseMap(await be.readText(path!));
    expect(saved).toMatchObject({ name: "stage1", id: 5, width: 4, height: 3 });
    expect(await be.readText(path!)).toBe(serializeMap(buildNewMap(SPEC, 5)));
    expect(revealed).toEqual([path]);
    expect(log.entries.map((e) => e.text).join("\n")).toContain("새 맵을 만들었다: resources/maps/stage1.json (4x3 칸, 타일 16px, 타일셋 resources/tiles/meadow16.png (8열), 레이어 ground, deco, 통행 있음)");
  });

  it("이미 있으면 덮어쓰지 않는다", async () => {
    const { be, host, toasts } = await project({ "resources/maps/stage1.json": "원래 것" });
    expect(await createMapFile(host, SPEC)).toBeNull();
    expect(await be.readText("resources/maps/stage1.json")).toBe("원래 것");
    expect(toasts).toEqual(["warn: 이미 있다: resources/maps/stage1.json"]);
  });

  it("쓰기에 실패하면 알리고 null", async () => {
    const { be, host, toasts, log } = await project({});
    be.writeText = async () => {
      throw new Error("디스크가 찼다");
    };
    expect(await createMapFile(host, SPEC)).toBeNull();
    expect(toasts).toEqual(["error: 맵을 만들지 못했다: 디스크가 찼다"]);
    expect(log.entries.some((e) => e.level === "error")).toBe(true);
  });
});
