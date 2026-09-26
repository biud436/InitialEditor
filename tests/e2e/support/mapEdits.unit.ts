import { describe, expect, it } from "vitest";
import { parseMap, type MapData } from "../../../packages/ext-tilemap/src/model/format";
import { cellEdits, objectEdits, structureChanges } from "./mapEdits";

interface RawObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  props?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RawMap {
  [key: string]: unknown;
  name: string;
  width: number;
  height: number;
  layers: Array<{ name: string; data: number[] }>;
  collision?: number[];
  tilesets: Array<{ image: string; firstGid: number; columns: number }>;
  events: unknown[];
  objects: RawObject[];
}

const BASE: RawMap = {
  version: 2,
  name: "small",
  id: 7,
  width: 3,
  height: 2,
  tileWidth: 16,
  tileHeight: 16,
  layers: [
    { name: "ground", data: [1, 1, 1, 2, 2, 2] },
    { name: "deco", data: [0, 0, 0, 0, 0, 0] },
  ],
  collision: [0, 0, 0, 1, 1, 1],
  tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8 }],
  events: [{ x: 1, y: 1, commands: [] }],
  objects: [
    { id: "start", type: "start", x: 8, y: 8 },
    { id: "spawn_1", type: "spawn", x: 24, y: 8, props: { species: "wolf", minX: 0, maxX: 40 } },
    { id: "sign", type: "landmark", x: 0, y: 0, width: 16, props: { text: "hi" }, note: "keep" },
  ],
  editorNote: "unknown key",
};

function map(mutate?: (m: RawMap) => void): MapData {
  const m = JSON.parse(JSON.stringify(BASE)) as RawMap;
  mutate?.(m);
  return parseMap(JSON.stringify(m));
}

describe("structureChanges", () => {
  it("같은 맵이면 비었다", () => {
    expect(structureChanges(map(), map())).toEqual([]);
  });

  it("크기, 타일셋, 레이어 이름과 수, 통행 유무, events, 모르는 키의 차이를 적는다", () => {
    const after = map((m) => {
      m.name = "renamed";
      m.tilesets[0].columns = 4;
      m.layers[1].name = "decor";
      m.events = [];
      m.editorNote = "changed";
    });
    expect(structureChanges(map(), after)).toEqual(["name: \"small\" → \"renamed\"", "tilesets가 다르다", "layers[1].name: deco → decor", "events가 다르다", "최상위의 다른 키가 다르다"]);
    const fewer = map((m) => {
      m.layers.pop();
      delete m.collision;
    });
    expect(structureChanges(map(), fewer)).toEqual(["레이어 수: 2 → 1", "collision: 있음 → 없음"]);
    const wider = map((m) => {
      m.width = 6;
      m.height = 1;
    });
    expect(structureChanges(map(), wider)).toEqual(["width: 3 → 6", "height: 2 → 1"]);
  });
});

describe("cellEdits", () => {
  it("바뀐 칸만 레이어 순서로, 통행은 맨 뒤에 칸 좌표와 함께", () => {
    const after = map((m) => {
      m.collision![0] = 1;
      m.layers[1].data[5] = 9;
      m.layers[0].data[1] = 3;
    });
    expect(cellEdits(map(), after)).toEqual([
      { layer: 0, index: 1, x: 1, y: 0, before: 1, after: 3 },
      { layer: 1, index: 5, x: 2, y: 1, before: 0, after: 9 },
      { layer: "collision", index: 0, x: 0, y: 0, before: 0, after: 1 },
    ]);
    expect(cellEdits(map(), map())).toEqual([]);
  });
});

describe("objectEdits", () => {
  it("바뀐 칸을 경로 이름순으로 적는다 (props, 모르는 키 포함)", () => {
    const after = map((m) => {
      m.objects[1].x = 88;
      m.objects[1].props!.maxX = 104;
      m.objects[1].props!.minX = 64;
      m.objects[2].note = "changed";
    });
    expect(objectEdits(map().objects, after.objects)).toEqual([
      {
        kind: "changed",
        id: "spawn_1",
        changes: [
          { path: "props.maxX", before: 40, after: 104 },
          { path: "props.minX", before: 0, after: 64 },
          { path: "x", before: 24, after: 88 },
        ],
      },
      { kind: "changed", id: "sign", changes: [{ path: "extra.note", before: "keep", after: "changed" }] },
    ]);
  });

  it("더함, 뺌, 순서 바뀜, 칸이 생기거나 사라짐", () => {
    const after = map((m) => {
      const [start, spawn] = m.objects;
      delete spawn.props!.maxX;
      m.objects = [spawn, start, { id: "new_1", type: "start", x: 1, y: 1 }];
    });
    expect(objectEdits(map().objects, after.objects)).toEqual([
      { kind: "removed", id: "sign" },
      { kind: "added", id: "new_1" },
      { kind: "order", before: ["start", "spawn_1"], after: ["spawn_1", "start"] },
      { kind: "changed", id: "spawn_1", changes: [{ path: "props.maxX", before: 40, after: undefined }] },
    ]);
  });

  it("같으면 비었다", () => {
    expect(objectEdits(map().objects, map().objects)).toEqual([]);
  });
});
