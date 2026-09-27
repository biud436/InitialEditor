import { describe, expect, it } from "vitest";
import { UndoStack } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { parseMap, serializeMap, type MapData, type MapObject } from "./format";
import { MapDocument } from "./mapDocument";
import { MapModel } from "./mapModel";
import {
  anchorOffset,
  MAX_MAP_TILES,
  RESIZE_ANCHORS,
  resizeGrid,
  resizeSummary,
  shiftEvents,
  shiftObject,
  validateMapSize,
  xCoordinateProps,
  type ResizeAnchor,
} from "./resize";
import { parseObjectSchema } from "./schema";

const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        fields: [
          { name: "species", type: "enum", values: ["slime"] },
          { name: "minX", type: "number", role: "rangeMin" },
          { name: "maxX", type: "number", role: "rangeMax" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
      { type: "landmark", label: "흔적", shape: "band", defaultWidth: 16 },
      { type: "zone", label: "구간", shape: "rect" },
    ],
  }),
);

/** 3x2 맵. ground는 1..6, deco는 (2,1)만 9, 통행은 (0,0)만 막힘 */
function small(extra: Partial<Record<string, unknown>> = {}): MapData {
  return parseMap(
    JSON.stringify({
      version: 2,
      name: "small",
      id: 3,
      width: 3,
      height: 2,
      tileWidth: 16,
      tileHeight: 8,
      layers: [
        { name: "ground", data: [1, 2, 3, 4, 5, 6] },
        { name: "deco", data: [0, 0, 0, 0, 0, 9], note: "보존" },
      ],
      collision: [1, 0, 0, 0, 0, 0],
      tilesets: [{ image: "resources/tiles/a.png", firstGid: 1, columns: 8 }],
      events: [{ id: "crate", x: 2, y: 1, commands: [] }, "모양이 다른 이벤트"],
      objects: [
        { id: "start", type: "start", x: 8, y: 4 },
        { id: "slime_1", type: "spawn", x: 24, y: 12, props: { species: "slime", minX: 16, maxX: 40 } },
        { id: "sign_1", type: "landmark", x: 16, y: 0, width: 16, props: { text: "a" } },
        { id: "zone_1", type: "zone", x: 0, y: 0, width: 32, height: 16 },
      ],
      ...extra,
    }),
  );
}

function rows(data: readonly number[], width: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < data.length; i += width) out.push(data.slice(i, i + width));
  return out;
}

describe("기준점과 칸 옮기기", () => {
  it("아홉 기준점의 차이: 늘릴 때", () => {
    const from = { width: 4, height: 4 };
    const to = { width: 7, height: 6 };
    const got = Object.fromEntries(RESIZE_ANCHORS.map((a) => [a, anchorOffset(a, from, to)]));
    expect(got).toEqual({
      "top-left": { dx: 0, dy: 0 },
      top: { dx: 1, dy: 0 },
      "top-right": { dx: 3, dy: 0 },
      left: { dx: 0, dy: 1 },
      center: { dx: 1, dy: 1 },
      right: { dx: 3, dy: 1 },
      "bottom-left": { dx: 0, dy: 2 },
      bottom: { dx: 1, dy: 2 },
      "bottom-right": { dx: 3, dy: 2 },
    });
  });

  it("줄일 때는 음수이고 가운데는 0 쪽으로 버린다 (-0이 아니다)", () => {
    expect(anchorOffset("bottom-right", { width: 7, height: 6 }, { width: 4, height: 4 })).toEqual({ dx: -3, dy: -2 });
    const c = anchorOffset("center", { width: 5, height: 5 }, { width: 4, height: 4 });
    expect(c).toEqual({ dx: 0, dy: 0 });
    expect(Object.is(c.dx, -0)).toBe(false);
    expect(anchorOffset("center", { width: 7, height: 7 }, { width: 4, height: 4 })).toEqual({ dx: -1, dy: -1 });
  });

  it("같은 기준점으로 늘렸다 줄이면 제자리다 (아홉 곳, 홀수와 짝수 차이)", () => {
    const from = { width: 5, height: 3 };
    const data = Array.from({ length: 15 }, (_, i) => i + 1);
    for (const anchor of RESIZE_ANCHORS) {
      for (const to of [{ width: 8, height: 6 }, { width: 9, height: 4 }]) {
        const grown = resizeGrid(data, from, to, anchorOffset(anchor, from, to));
        const back = resizeGrid(grown, to, from, anchorOffset(anchor, to, from));
        expect(back, `${anchor} ${to.width}x${to.height}`).toEqual(data);
      }
    }
  });

  it("칸 배열: 새 칸은 0이고, 줄이면 기준점 반대쪽이 잘린다", () => {
    const data = [1, 2, 3, 4, 5, 6];
    const from = { width: 3, height: 2 };
    const grow = (anchor: ResizeAnchor) => rows(resizeGrid(data, from, { width: 4, height: 3 }, anchorOffset(anchor, from, { width: 4, height: 3 })), 4);
    expect(grow("top-left")).toEqual([[1, 2, 3, 0], [4, 5, 6, 0], [0, 0, 0, 0]]);
    expect(grow("bottom-right")).toEqual([[0, 0, 0, 0], [0, 1, 2, 3], [0, 4, 5, 6]]);
    expect(grow("center")).toEqual([[1, 2, 3, 0], [4, 5, 6, 0], [0, 0, 0, 0]]);
    const shrink = (anchor: ResizeAnchor) => resizeGrid(data, from, { width: 2, height: 1 }, anchorOffset(anchor, from, { width: 2, height: 1 }));
    expect(shrink("top-left")).toEqual([1, 2]);
    expect(shrink("top-right")).toEqual([2, 3]);
    expect(shrink("bottom-left")).toEqual([4, 5]);
    expect(shrink("bottom-right")).toEqual([5, 6]);
    expect(resizeGrid([7], { width: 1, height: 1 }, { width: 2, height: 1 }, { dx: 1, dy: 0 }, 5)).toEqual([5, 7]);
  });

  it("크기 검사", () => {
    expect(validateMapSize(1, 1)).toBeNull();
    expect(validateMapSize(MAX_MAP_TILES, MAX_MAP_TILES)).toBeNull();
    for (const [w, h] of [[0, 5], [5, 0], [MAX_MAP_TILES + 1, 1], [2.5, 3], [Number.NaN, 3]]) expect(validateMapSize(w, h)).toMatch(/1 이상 1024 이하/);
  });
});

describe("오브젝트와 이벤트 옮기기", () => {
  const byId = (id: string) => small().objects.find((o) => o.id === id)!;
  const spec = (type: string) => SCHEMA.types.find((t) => t.type === type);

  it("점은 x와 y, 범위 칸은 x와 함께, 띠는 y를 둔다, 사각형은 둘 다", () => {
    expect(xCoordinateProps(spec("spawn"))).toEqual(["minX", "maxX"]);
    expect(xCoordinateProps(undefined)).toEqual([]);
    expect(shiftObject(byId("slime_1"), 16, 8, spec("spawn"))).toMatchObject({ x: 40, y: 20, props: { species: "slime", minX: 32, maxX: 56 } });
    expect(shiftObject(byId("sign_1"), 16, 8, spec("landmark"))).toMatchObject({ x: 32, y: 0 });
    expect(shiftObject(byId("zone_1"), -16, 8, spec("zone"))).toMatchObject({ x: -16, y: 8, width: 32, height: 16 });
    // 스키마가 없으면 범위 칸을 모르므로 두고, 폭만 있는 것은 띠로 본다
    expect(shiftObject(byId("slime_1"), 16, 8)).toMatchObject({ x: 40, y: 20, props: { minX: 16, maxX: 40 } });
    expect(shiftObject(byId("sign_1"), 16, 8)).toMatchObject({ x: 32, y: 0 });
    expect(shiftObject(byId("zone_1"), 16, 8)).toMatchObject({ x: 16, y: 8 });
  });

  it("원본을 건드리지 않는다", () => {
    const o = byId("slime_1");
    const copy: MapObject = JSON.parse(JSON.stringify(o));
    shiftObject(o, 5, 5, spec("spawn"));
    expect(o).toEqual(copy);
  });

  it("이벤트는 칸 좌표를 옮기고 모양이 다른 것은 그대로 둔다", () => {
    expect(shiftEvents([{ id: "a", x: 1, y: 2, commands: [{ code: "message" }] }, "문자열", { id: "b", x: "3" }], { dx: 2, dy: -1 })).toEqual([
      { id: "a", x: 3, y: 1, commands: [{ code: "message" }] },
      "문자열",
      { id: "b", x: "3" },
    ]);
  });

  it("배회 구역도 같은 만큼 옮기고 키 순서와 다른 칸은 그대로 둔다", () => {
    const ev = { id: "kid", x: 4, y: 5, wander: { minWait: 30, area: { x: 3, y: 4, w: 3, h: 2 }, note: 1 }, commands: [] };
    const [moved] = shiftEvents([ev], { dx: -2, dy: 3 });
    const expected = { id: "kid", x: 2, y: 8, wander: { minWait: 30, area: { x: 1, y: 7, w: 3, h: 2 }, note: 1 }, commands: [] };
    expect(JSON.stringify(moved)).toBe(JSON.stringify(expected));
    // 구역이 없거나 좌표가 수가 아니면 배회는 같은 객체다
    const noArea = { id: "a", x: 0, y: 0, wander: { minWait: 1 } };
    const badArea = { id: "b", x: 0, y: 0, wander: { area: { x: "1", y: 0 } } };
    const [a, b] = shiftEvents([noArea, badArea], { dx: 1, dy: 1 }) as Array<Record<string, unknown>>;
    expect(a.wander).toBe(noArea.wander);
    expect(b.wander).toBe(badArea.wander);
    expect(ev.wander.area).toEqual({ x: 3, y: 4, w: 3, h: 2 });
  });

  it("미리 보기: 맵 밖으로 나가는 오브젝트와 이벤트, 잘림", () => {
    const m = small();
    const src = { ...m, events: m.events };
    // 오른쪽 아래를 기준으로 1x1로 줄이면 x가 -32, y가 -8 옮겨진다
    const s = resizeSummary(src, { width: 1, height: 1 }, "bottom-right", SCHEMA);
    expect(s.offset).toEqual({ dx: -2, dy: -1 });
    expect(s.clips).toBe(true);
    // start (8,4) → (-24,-4) 밖, slime (24,12) → (-8,4) 밖, sign x 16 → -16 밖(띠는 y를 보지 않는다), zone (0,0) → 밖
    expect(s.objectsOutside).toEqual(["start", "slime_1", "sign_1", "zone_1"]);
    expect(s.eventsOutside).toBe(0);
    const grow = resizeSummary(src, { width: 5, height: 4 }, "top-left", SCHEMA);
    expect(grow).toEqual({ offset: { dx: 0, dy: 0 }, clips: false, objectsOutside: [], objectsPartlyOutside: [], eventsOutside: 0 });
    // 왼쪽 위 기준으로 2x1로 줄이면 이벤트 (2,1)이 밖이고, 구간(높이 16)의 아래 끝이 새 높이 8을 넘는다
    expect(resizeSummary(src, { width: 2, height: 1 }, "top-left", SCHEMA)).toMatchObject({ eventsOutside: 1, objectsOutside: ["slime_1"], objectsPartlyOutside: ["zone_1"] });
  });

  it("미리 보기: 자리는 안인데 띠, 사각형의 끝이나 순찰 범위가 밖까지 가는 오브젝트를 따로 센다", () => {
    const m = small();
    const extra: MapObject[] = [
      { id: "sign_2", type: "landmark", x: 24, y: 0, width: 16, props: {}, extra: {} },
      { id: "slime_2", type: "spawn", x: 40, y: 4, props: { minX: 8, maxX: 44 }, extra: {} },
    ];
    const src = { ...m, objects: [...m.objects, ...extra] };
    // 왼쪽 위 기준 2x2 (폭 32px): slime_1의 maxX 40, sign_2의 끝 40이 밖이다. sign_1의 끝 32와 zone_1의 끝 32는 딱 맞다
    const s = resizeSummary(src, { width: 2, height: 2 }, "top-left", SCHEMA);
    expect(s.objectsOutside).toEqual(["slime_2"]);
    expect(s.objectsPartlyOutside).toEqual(["slime_1", "sign_2"]);
    // 왼쪽 위 기준 1x2 (폭 16px): zone_1은 자리 (0,0)이 안이고 끝 32가 밖이다
    expect(resizeSummary(src, { width: 1, height: 2 }, "top-left", SCHEMA)).toMatchObject({
      objectsOutside: ["slime_1", "sign_1", "sign_2", "slime_2"],
      objectsPartlyOutside: ["zone_1"],
    });
    // 오른쪽 기준 2x2 (16px 왼쪽으로): slime_2는 x 24로 안이고 minX가 -8이 되어 밖까지 간다
    const right = resizeSummary(src, { width: 2, height: 2 }, "right", SCHEMA);
    expect(right.offset).toEqual({ dx: -1, dy: 0 });
    expect(right.objectsPartlyOutside).toContain("slime_2");
    expect(right.objectsOutside).not.toContain("slime_2");
  });
});

describe("MapModel.resize", () => {
  it("늘리기 (왼쪽 위): 겹친 칸은 그대로, 새 칸은 0, 오브젝트는 제자리", () => {
    const model = new MapModel(small());
    const undo = new UndoStack();
    undo.push(model.resize(5, 3, "top-left", SCHEMA));
    expect([model.width, model.height, model.pixelWidth, model.pixelHeight]).toEqual([5, 3, 80, 24]);
    expect(rows(model.layers[0].data, 5)).toEqual([[1, 2, 3, 0, 0], [4, 5, 6, 0, 0], [0, 0, 0, 0, 0]]);
    expect(rows(model.layers[1].data, 5)).toEqual([[0, 0, 0, 0, 0], [0, 0, 9, 0, 0], [0, 0, 0, 0, 0]]);
    expect(rows(model.collision!, 5)).toEqual([[1, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
    expect(model.findObject("slime_1")).toMatchObject({ x: 24, y: 12, props: { minX: 16, maxX: 40 } });
    expect(model.toData().events).toEqual(small().events);
  });

  it("늘리기 (오른쪽 아래): 칸과 통행과 오브젝트와 범위와 이벤트가 같은 만큼 옮겨진다", () => {
    const model = new MapModel(small());
    model.resize(5, 3, "bottom-right", SCHEMA).execute();
    expect(rows(model.layers[0].data, 5)).toEqual([[0, 0, 0, 0, 0], [0, 0, 1, 2, 3], [0, 0, 4, 5, 6]]);
    expect(rows(model.collision!, 5)).toEqual([[0, 0, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0]]);
    // 2칸(32px) 오른쪽, 1칸(8px) 아래
    expect(model.findObject("start")).toMatchObject({ x: 40, y: 12 });
    expect(model.findObject("slime_1")).toMatchObject({ x: 56, y: 20, props: { minX: 48, maxX: 72 } });
    expect(model.findObject("sign_1")).toMatchObject({ x: 48, y: 0 });
    expect(model.findObject("zone_1")).toMatchObject({ x: 32, y: 8, width: 32, height: 16 });
    expect(model.toData().events).toEqual([{ id: "crate", x: 4, y: 2, commands: [] }, "모양이 다른 이벤트"]);
  });

  it("줄이기 (가운데): 가장자리가 잘리고, 파일로 써도 길이가 맞는다", () => {
    const data = small();
    const model = new MapModel({ ...data, width: 3, height: 2 });
    model.resize(1, 1, "center").execute();
    // 가로 3 → 1은 한 칸 왼쪽으로, 세로 2 → 1은 0 쪽으로 버려 제자리
    expect(model.layers[0].data).toEqual([2]);
    expect(model.collision).toEqual([0]);
    const back = parseMap(serializeMap(model.toData()));
    expect([back.width, back.height, back.layers[0].data.length, back.collision?.length]).toEqual([1, 1, 1, 1]);
    expect(back.layers[1].extra).toEqual({ note: "보존" });
  });

  it("통행이 없는 맵은 없는 채로 둔다", () => {
    const model = new MapModel(small({ collision: undefined }));
    model.resize(4, 4).execute();
    expect(model.collision).toBeNull();
    expect(model.layers[0].data.length).toBe(16);
  });

  it("되돌리기 한 단계로 파일 내용까지 정확히 돌아가고, 다시 실행하면 같은 결과다", () => {
    const model = new MapModel(small());
    const undo = new UndoStack();
    const original = serializeMap(model.toData());
    undo.push(model.resize(6, 5, "bottom", SCHEMA));
    const resized = serializeMap(model.toData());
    expect(undo.depth).toBe(1);
    expect(undo.undoLabel).toContain("크기 바꾸기: 3x2 → 6x5");
    undo.undo();
    expect(serializeMap(model.toData())).toBe(original);
    expect(model.toData()).toEqual(small());
    undo.redo();
    expect(serializeMap(model.toData())).toBe(resized);
  });

  it("앞뒤의 칠하기와 레이어 명령과 섞여도 차례로 되돌리면 원래대로다", () => {
    const model = new MapModel(small());
    const undo = new UndoStack();
    const original = serializeMap(model.toData());
    undo.push(model.paintCells(0, [{ index: 0, value: 7 }]));
    undo.push(model.removeLayer(1));
    undo.push(model.resize(4, 4, "right", SCHEMA));
    undo.push(model.paintCells(0, [{ index: 15, value: 8 }]));
    undo.push(model.paintCells("collision", [{ index: 14, value: 1 }]));
    undo.push(model.addLayer("over"));
    expect(model.layers.map((l) => l.data.length)).toEqual([16, 16]);
    // 3x2 → 4x4 오른쪽 기준은 (1, 1) 옮김이라 (0, 0)의 7이 (1, 1)에 있다
    expect(model.layers[0].data[5]).toBe(7);
    expect(model.layers[0].data[15]).toBe(8);
    while (undo.canUndo) undo.undo();
    expect(serializeMap(model.toData())).toBe(original);
    while (undo.canRedo) undo.redo();
    expect(model.width).toBe(4);
    expect(model.layers.map((l) => l.name)).toEqual(["ground", "over"]);
    expect(model.collision?.[14]).toBe(1);
  });

  it("다시 그리기 이벤트(reset)를 한 번 내고 판을 올린다", () => {
    const model = new MapModel(small());
    let resets = 0;
    model.events.on("reset", () => resets++);
    const before = model.revision;
    const cmd = model.resize(4, 2);
    cmd.execute();
    cmd.undo();
    expect(resets).toBe(2);
    expect(model.revision).toBe(before + 2);
  });

  it("쓸 수 없는 크기는 명령을 만들지 않는다", () => {
    const model = new MapModel(small());
    expect(() => model.resize(0, 3)).toThrow(/1 이상 1024 이하/);
    expect(() => model.resize(3, 1025)).toThrow();
    expect(() => model.resize(3, 3, "middle" as ResizeAnchor)).not.toThrow();
    expect(() => model.resize(3, 3, "middle" as ResizeAnchor).execute()).toThrow(/모르는 기준점/);
  });
});

describe("MapDocument와 크기 바꾸기", () => {
  it("선택은 남고, 다시 읽어 없어진 오브젝트만 선택에서 빠진다", async () => {
    const path = "resources/maps/small.json";
    const be = new MemoryBackend({ [path]: serializeMap(small()) });
    await be.open("/mem");
    const doc = await MapDocument.open(be, path, SCHEMA);
    doc.select(["slime_1", "start"]);
    doc.apply(doc.model.resize(6, 4, "bottom-right", doc.schema));
    expect(doc.selectedIds).toEqual(["start", "slime_1"]);
    expect(doc.dirty).toBe(true);
    await doc.save();
    const saved = parseMap(await be.readText(path));
    expect([saved.width, saved.height]).toEqual([6, 4]);
    expect(saved.objects.find((o) => o.id === "slime_1")).toMatchObject({ x: 72, y: 28, props: { minX: 64, maxX: 88 } });

    const without = small();
    without.objects = without.objects.filter((o) => o.id !== "slime_1");
    be.simulateExternalChange(path, "modify", serializeMap(without));
    await doc.reloadFromDisk();
    expect(doc.selectedIds).toEqual(["start"]);
  });
});
