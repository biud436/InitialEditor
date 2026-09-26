import { describe, expect, it } from "vitest";
import { parseObjectSchema, singleBrush, type MapObject } from "@initial-editor/ext-tilemap/model";
import {
  bandEdgeDrag,
  brushInTileset,
  cellAt,
  cellRange,
  centerOn,
  chunkCells,
  chunkGrid,
  chunkOfIndex,
  clampRange,
  clampZoom,
  fitRect,
  groupByChunk,
  hitObject,
  initialView,
  isLargeBand,
  moveTargets,
  nextZoomStep,
  nudgeStep,
  onlyChanged,
  patternStamp,
  prevZoomStep,
  rangeDragValue,
  screenToWorld,
  shapeBounds,
  shapeOf,
  shapesInRect,
  strokeChanges,
  strokeSegment,
  tileGridLines,
  worldToScreen,
} from "./mapGeometry";

const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        color: "danger",
        fields: [
          { name: "species", type: "enum", values: ["wolf"] },
          { name: "left", type: "number", role: "rangeMin" },
          { name: "right", type: "number", role: "rangeMax" },
        ],
      },
      { type: "landmark", label: "흔적", shape: "band", defaultWidth: 48 },
      { type: "zone", label: "구역", shape: "rect" },
    ],
  }),
);
const spec = (type: string) => SCHEMA.types.find((t) => t.type === type);
const obj = (o: Partial<MapObject> & { id: string; type: string }): MapObject => ({ x: 0, y: 0, props: {}, extra: {}, ...o });

describe("칸과 화면", () => {
  it("월드 점의 칸 (음수도 내림)", () => {
    expect(cellAt({ x: 15.9, y: 16 }, 16, 16)).toEqual({ x: 0, y: 1 });
    expect(cellAt({ x: -0.1, y: 40 }, 16, 16)).toEqual({ x: -1, y: 2 });
    const t = { zoom: 2, panX: 24, panY: 10 };
    const world = screenToWorld(t, { x: 24 + 2 * 40, y: 10 + 2 * 20 });
    expect(world).toEqual({ x: 40, y: 20 });
    expect(worldToScreen(t, world)).toEqual({ x: 104, y: 50 });
  });

  it("칸 범위는 정규화되고 맵 안으로 잘린다", () => {
    expect(cellRange({ x: 5, y: 1 }, { x: 2, y: 3 })).toEqual({ x0: 2, y0: 1, x1: 5, y1: 3 });
    expect(clampRange({ x0: -3, y0: -1, x1: 30, y1: 2 }, { width: 20, height: 12 })).toEqual({ x0: 0, y0: 0, x1: 19, y1: 2 });
    expect(clampRange({ x0: 25, y0: 0, x1: 30, y1: 2 }, { width: 20, height: 12 })).toBeNull();
  });

  it("줌은 0.1에서 8까지이고, 맵 전체 보기는 4096px 맵도 한 화면에 넣는다", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(20)).toBe(8);
    expect(nextZoomStep(0.25)).toBe(0.5);
    expect(prevZoomStep(0.25)).toBe(0.125);
    expect(prevZoomStep(0.1)).toBe(0.1);
    const fit = fitRect({ width: 920, height: 550 }, { x: 0, y: 0, w: 4096, h: 448 }, 24);
    expect(fit.zoom).toBeCloseTo(872 / 4096);
    const center = worldToScreen(fit, { x: 2048, y: 224 });
    expect(center.x).toBeCloseTo(460);
    expect(center.y).toBeCloseTo(275);
  });

  it("처음 보기: 들어가면 정수 배율로 가운데, 아니면 100%로 왼쪽 위", () => {
    expect(initialView({ width: 800, height: 600 }, 320, 192)).toEqual({ zoom: 2, panX: 80, panY: 108 });
    expect(initialView({ width: 900, height: 600 }, 4096, 448)).toEqual({ zoom: 1, panX: 24, panY: 24 });
    const c = centerOn({ zoom: 2, panX: 0, panY: 0 }, { width: 400, height: 300 }, { x: 100, y: 50 });
    expect(worldToScreen(c, { x: 100, y: 50 })).toEqual({ x: 200, y: 150 });
  });
});

describe("덩어리", () => {
  const map = { width: 256, height: 28 };
  const grid = chunkGrid(map, 32);

  it("256x28 맵은 32칸 덩어리 8x1이고 마지막 행은 잘린다", () => {
    expect(grid).toEqual({ cols: 8, rows: 1, size: 32 });
    expect(chunkCells(7, map, grid)).toEqual({ x0: 224, y0: 0, w: 32, h: 28 });
    expect(chunkGrid({ width: 80, height: 70 })).toEqual({ cols: 3, rows: 3, size: 32 });
    expect(chunkCells(8, { width: 80, height: 70 }, chunkGrid({ width: 80, height: 70 }))).toEqual({ x0: 64, y0: 64, w: 16, h: 6 });
  });

  it("칸 번호에서 덩어리, 바뀐 칸 묶기", () => {
    expect(chunkOfIndex(0, 256, grid)).toBe(0);
    expect(chunkOfIndex(31, 256, grid)).toBe(0);
    expect(chunkOfIndex(32, 256, grid)).toBe(1);
    expect(chunkOfIndex(27 * 256 + 255, 256, grid)).toBe(7);
    const groups = groupByChunk([0, 5, 40, 300, 255], 256, grid);
    expect([...groups.entries()]).toEqual([
      [0, [0, 5]],
      [1, [40, 300]],
      [7, [255]],
    ]);
  });
});

describe("붓질", () => {
  const map = { width: 10, height: 6 };

  it("붓질 선: 처음은 한 칸, 다음은 지난 칸을 빼고 새 칸까지, 같은 칸이면 없음", () => {
    expect(strokeSegment(null, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
    expect(strokeSegment({ x: 2, y: 2 }, { x: 5, y: 2 })).toEqual([
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
    ]);
    expect(strokeSegment({ x: 5, y: 2 }, { x: 5, y: 2 })).toEqual([]);
  });

  it("빠르게 끌어도 칸을 건너뛰지 않는다 (누적한 칸이 이어진다)", () => {
    let last: { x: number; y: number } | null = null;
    const painted: string[] = [];
    for (const p of [{ x: 0, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 1 }, { x: 1, y: 4 }]) {
      for (const c of strokeSegment(last, p)) painted.push(`${c.x},${c.y}`);
      last = p;
    }
    expect(painted[0]).toBe("0,0");
    expect(painted).toContain("4,1");
    expect(painted[painted.length - 1]).toBe("1,4");
    expect(new Set(painted).size).toBe(painted.length);
  });

  it("여러 칸 붓은 시작 칸에 맞춘 무늬로 찍혀 겹쳐도 어긋나지 않는다", () => {
    const brush = { width: 2, height: 1, gids: [[7, 8]] };
    const origin = { x: 2, y: 1 };
    expect(patternStamp(map, brush, origin, origin)).toEqual([
      { index: 12, value: 7 },
      { index: 13, value: 8 },
    ]);
    // 한 칸 옆에 찍어도 무늬는 시작 칸 기준: x=3은 8, x=4는 7
    expect(patternStamp(map, brush, origin, { x: 3, y: 1 })).toEqual([
      { index: 13, value: 8 },
      { index: 14, value: 7 },
    ]);
    const changes = strokeChanges(map, brush, origin, [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }]);
    expect(changes.map((c) => `${c.index}:${c.value}`)).toEqual(["12:7", "13:8", "14:7", "15:8"]);
    // 맵 밖은 버린다
    expect(patternStamp(map, brush, { x: 9, y: 0 }, { x: 9, y: 0 })).toEqual([{ index: 9, value: 7 }]);
  });

  it("값이 같은 칸은 뺀다 (통행이 없으면 0으로 본다)", () => {
    expect(onlyChanged([1, 1, 2], [{ index: 0, value: 1 }, { index: 2, value: 1 }])).toEqual([{ index: 2, value: 1 }]);
    expect(onlyChanged(null, [{ index: 0, value: 0 }, { index: 1, value: 1 }])).toEqual([{ index: 1, value: 1 }]);
    expect(strokeChanges(map, singleBrush(0), { x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual([{ index: 0, value: 0 }]);
  });
});

describe("팔레트", () => {
  const tileset = { firstGid: 1, columns: 8 };
  it("팔레트에서 뜬 사각형이면 rect 하나, 맵에서 뜬 붓이면 칸들", () => {
    expect(brushInTileset({ width: 2, height: 2, gids: [[3, 4], [11, 12]] }, tileset, 5).rect).toEqual({ col: 2, row: 0, width: 2, height: 2 });
    const picked = brushInTileset({ width: 2, height: 1, gids: [[9, 1]] }, tileset, 5);
    expect(picked.rect).toBeNull();
    expect(picked.cells).toEqual([
      { col: 0, row: 1 },
      { col: 0, row: 0 },
    ]);
    // 다른 타일셋의 gid와 빈 칸은 빠진다
    expect(brushInTileset({ width: 1, height: 1, gids: [[0]] }, tileset, 5)).toEqual({ rect: null, cells: [] });
    expect(brushInTileset({ width: 1, height: 1, gids: [[41]] }, tileset, 5)).toEqual({ rect: null, cells: [] });
  });
});

describe("오브젝트 모양과 맞히기", () => {
  const wolf = obj({ id: "wolf", type: "spawn", x: 100, y: 80, props: { species: "wolf", left: 60, right: 160 } });
  const tracks = obj({ id: "tracks", type: "landmark", x: 200, y: 0 });
  const zone = obj({ id: "zone", type: "zone", x: 300, y: 40, width: 32, height: 16 });
  const loose = obj({ id: "mystery", type: "unknown", x: 10, y: 10, width: 20 });
  const shapes = [tracks, wolf, zone, loose].map((o) => shapeOf(o, spec(o.type)));
  const H = 448;

  it("스키마의 모양과 역할 칸을 따른다. 스키마에 없으면 폭과 높이로 짐작한다", () => {
    expect(shapes[0]).toEqual({ kind: "band", id: "tracks", x: 200, width: 48 });
    expect(shapes[1]).toEqual({ kind: "point", id: "wolf", x: 100, y: 80, range: { min: 60, max: 160, minField: "left", maxField: "right" } });
    expect(shapes[2]).toMatchObject({ kind: "rect", width: 32, height: 16 });
    expect(shapes[3]).toMatchObject({ kind: "band", width: 20 });
    expect(shapeOf(obj({ id: "p", type: "unknown", x: 1, y: 2 }), undefined)).toEqual({ kind: "point", id: "p", x: 1, y: 2, range: null });
    expect(shapeBounds(shapes[0], H)).toEqual({ x: 200, y: 0, w: 48, h: H });
    expect(shapeBounds(shapes[1], H)).toEqual({ x: 60, y: 80, w: 100, h: 0 });
  });

  it("점, 범위 손잡이, 띠 가장자리, 띠 안쪽, 사각형", () => {
    expect(hitObject(shapes, { x: 102, y: 79 }, 1, H)).toEqual({ id: "wolf", part: "body" });
    expect(hitObject(shapes, { x: 61, y: 86 }, 1, H)).toEqual({ id: "wolf", part: "rangeMin" });
    expect(hitObject(shapes, { x: 158, y: 74 }, 1, H)).toEqual({ id: "wolf", part: "rangeMax" });
    expect(hitObject(shapes, { x: 130, y: 80 }, 1, H)).toBeNull(); // 범위 선의 가운데는 맞지 않는다
    expect(hitObject(shapes, { x: 202, y: 300 }, 1, H)).toEqual({ id: "tracks", part: "bandLeft" });
    expect(hitObject(shapes, { x: 247, y: 5 }, 1, H)).toEqual({ id: "tracks", part: "bandRight" });
    expect(hitObject(shapes, { x: 224, y: 100 }, 1, H)).toEqual({ id: "tracks", part: "body" });
    expect(hitObject(shapes, { x: 310, y: 50 }, 1, H)).toEqual({ id: "zone", part: "body" });
    expect(hitObject(shapes, { x: 224, y: H + 20 }, 1, H)).toBeNull();
  });

  it("여유는 줌에 반비례한다 (화면 픽셀로 같다)", () => {
    // 점 반지름 6px + 여유 4px: 줌 1에서 9px 떨어진 곳은 맞고, 줌 4에서는 (월드 2.5px까지) 빗나간다
    expect(hitObject(shapes, { x: 109, y: 80 }, 1, H)?.id).toBe("wolf");
    expect(hitObject(shapes, { x: 109, y: 80 }, 4, H)).toBeNull();
    expect(hitObject(shapes, { x: 102, y: 80 }, 4, H)?.id).toBe("wolf");
  });

  it("점이 띠 안에 있어도 점이 먼저다", () => {
    const inside = [shapeOf(obj({ id: "band", type: "landmark", x: 90, y: 0 }), spec("landmark")), shapeOf(obj({ id: "p", type: "x", x: 100, y: 50 }), undefined)];
    expect(hitObject(inside, { x: 100, y: 50 }, 1, H)?.id).toBe("p");
    expect(hitObject([...inside].reverse(), { x: 100, y: 50 }, 1, H)?.id).toBe("p");
  });

  it("띠가 겹치면 좁은 띠가 먼저다 (넓은 띠가 목록의 뒤에 있어도)", () => {
    const band = (id: string, x: number, width: number) => shapeOf(obj({ id, type: "landmark", x, width }), spec("landmark"));
    const nested = [band("narrow", 300, 48), band("wide", 0, 767)];
    expect(hitObject(nested, { x: 324, y: 200 }, 1, H)).toEqual({ id: "narrow", part: "body" });
    expect(hitObject([...nested].reverse(), { x: 324, y: 200 }, 1, H)).toEqual({ id: "narrow", part: "body" });
    // 좁은 띠의 가장자리가 넓은 띠의 안쪽보다 먼저다
    expect(hitObject(nested, { x: 346, y: 200 }, 1, H)).toEqual({ id: "narrow", part: "bandRight" });
    // 좁은 띠 밖이면 넓은 띠
    expect(hitObject(nested, { x: 100, y: 200 }, 1, H)).toEqual({ id: "wide", part: "body" });
    // 넓은 띠의 가장자리가 좁은 띠 안에 들면 좁은 띠가 먼저다
    const straddle = [band("small", 740, 48), band("left", 0, 767), band("right", 767, 832)];
    expect(hitObject(straddle, { x: 769, y: 200 }, 1, H)).toEqual({ id: "small", part: "body" });
  });

  it("맞닿은 두 띠의 가장자리는 누른 쪽 띠의 것이다", () => {
    const band = (id: string, x: number, width: number) => shapeOf(obj({ id, type: "landmark", x, width }), spec("landmark"));
    const adjacent = [band("entrance", 0, 767), band("road", 767, 832)];
    expect(hitObject(adjacent, { x: 765, y: 200 }, 1, H)).toEqual({ id: "entrance", part: "bandRight" });
    expect(hitObject(adjacent, { x: 769, y: 200 }, 1, H)).toEqual({ id: "road", part: "bandLeft" });
    expect(hitObject([...adjacent].reverse(), { x: 765, y: 200 }, 1, H)).toEqual({ id: "entrance", part: "bandRight" });
    expect(hitObject([...adjacent].reverse(), { x: 769, y: 200 }, 1, H)).toEqual({ id: "road", part: "bandLeft" });
  });

  it("넓은 띠는 화면에서 뷰 폭의 반보다 넓은 띠다", () => {
    const section = shapeOf(obj({ id: "s", type: "landmark", x: 0, width: 800 }), spec("landmark"));
    // 큰 띠: 16칸 이상이거나 다른 오브젝트를 품는다. 줌과 무관하다
    expect(isLargeBand(section, shapes, 16)).toBe(true);
    expect(isLargeBand(shapes[1], shapes, 16)).toBe(false);
    expect(isLargeBand({ kind: "band", id: "narrow", x: 0, width: 40 }, [{ kind: "point", id: "p", x: 20, y: 0, range: null }], 16)).toBe(true);
    expect(isLargeBand({ kind: "band", id: "narrow", x: 0, width: 40 }, [{ kind: "point", id: "p", x: 60, y: 0, range: null }], 16)).toBe(false);
  });

  it("겹친 두 손잡이는 누른 쪽으로", () => {
    const s = [shapeOf(obj({ id: "w", type: "spawn", x: 300, y: 80, props: { left: 50, right: 50 } }), spec("spawn"))];
    expect(hitObject(s, { x: 52, y: 80 }, 1, H)).toEqual({ id: "w", part: "rangeMax" });
    expect(hitObject(s, { x: 48, y: 80 }, 1, H)).toEqual({ id: "w", part: "rangeMin" });
  });

  it("상자 선택: 점은 안에 있어야, 띠는 가로로 다 들어야, 사각형은 겹치면", () => {
    expect(shapesInRect(shapes, { x: 90, y: 70, w: 20, h: 20 }, H)).toEqual(["wolf"]);
    // 띠에 걸치기만 한 상자는 띠를 고르지 않는다 (구간 안에서 끈 상자가 구간까지 고르지 않게)
    expect(shapesInRect(shapes, { x: 240, y: 100, w: 70, h: 10 }, H)).toEqual([]);
    expect(shapesInRect(shapes, { x: 190, y: 100, w: 70, h: 10 }, H)).toEqual(["tracks"]);
    expect(shapesInRect(shapes, { x: 290, y: 30, w: 20, h: 20 }, H)).toEqual(["zone"]);
    expect(shapesInRect(shapes, { x: 0, y: 0, w: 1000, h: 1000 }, H)).toEqual(["tracks", "wolf", "zone", "mystery"]);
  });
});

describe("끌기 계산", () => {
  it("범위 손잡이는 반대쪽 끝과 맵 폭을 넘지 않는다", () => {
    const range = { min: 60, max: 160, minField: "minX", maxField: "maxX" };
    expect(rangeDragValue(range, "rangeMin", 40.4, 4096)).toEqual({ field: "minX", value: 40 });
    expect(rangeDragValue(range, "rangeMin", 200, 4096)).toEqual({ field: "minX", value: 160 });
    expect(rangeDragValue(range, "rangeMin", -30, 4096)).toEqual({ field: "minX", value: 0 });
    expect(rangeDragValue(range, "rangeMax", 5000, 4096)).toEqual({ field: "maxX", value: 4096 });
    expect(rangeDragValue(range, "rangeMax", 10, 4096)).toEqual({ field: "maxX", value: 60 });
  });

  it("띠 가장자리: 반대쪽은 제자리, 폭은 1 이상", () => {
    const start = { x: 200, width: 48 };
    expect(bandEdgeDrag(start, "bandRight", 280)).toEqual({ x: 200, width: 80 });
    expect(bandEdgeDrag(start, "bandRight", 150)).toEqual({ x: 200, width: 1 });
    expect(bandEdgeDrag(start, "bandLeft", 180)).toEqual({ x: 180, width: 68 });
    expect(bandEdgeDrag(start, "bandLeft", 400)).toEqual({ x: 247, width: 1 });
  });

  it("범위가 있는 점을 옮기면 범위도 폭을 지킨 채 같이 옮기고, 맵 폭 안에서 멈춘다", () => {
    const range = { min: 1950, max: 2030, minField: "minX", maxField: "maxX" };
    const start = [{ id: "wolf", x: 1990, y: 304, lockY: false, range }];
    expect(moveTargets(start, 64, 0, 4096)).toEqual([{ id: "wolf", x: 2054, y: 304, range: { ...range, min: 2014, max: 2094 } }]);
    // 몸통만 (Alt)
    expect(moveTargets(start, 64, 0, 4096, true)[0].range).toEqual(range);
    // 오른끝이 맵 폭에서 멈춘다
    expect(moveTargets(start, 3000, 0, 4096)[0]).toMatchObject({ x: 4990, range: { min: 4016, max: 4096 } });
    expect(moveTargets(start, -3000, 0, 4096)[0].range).toMatchObject({ min: 0, max: 80 });
  });

  it("옮기기는 정수 픽셀이고 띠는 세로로 움직이지 않는다", () => {
    const moves = moveTargets(
      [
        { id: "a", x: 10, y: 20, lockY: false },
        { id: "band", x: 100, y: 0, lockY: true },
      ],
      12.6,
      -4.2,
    );
    expect(moves).toEqual([
      { id: "a", x: 23, y: 16 },
      { id: "band", x: 113, y: 0 },
    ]);
    expect(nudgeStep("ArrowLeft", false, 16, 16)).toEqual({ x: -1, y: 0 });
    expect(nudgeStep("ArrowDown", true, 16, 8)).toEqual({ x: 0, y: 8 });
    expect(nudgeStep("a", false, 16, 16)).toBeNull();
  });
});

describe("타일 격자", () => {
  it("맵 안쪽만, 8칸마다 굵은 선, 촘촘하면 가는 선을 뺀다", () => {
    const map = { width: 20, height: 12 };
    const lines = tileGridLines({ zoom: 1, panX: 0, panY: 0 }, { width: 1000, height: 1000 }, 16, 16, map)!;
    expect(lines.right).toBe(320);
    expect(lines.bottom).toBe(192);
    expect(lines.major.xs).toEqual([0, 128, 256]);
    expect(lines.minor.xs.length).toBe(21 - 3);
    const far = tileGridLines({ zoom: 0.25, panX: 0, panY: 0 }, { width: 1000, height: 1000 }, 16, 16, map)!;
    expect(far.minor.xs).toEqual([]);
    expect(far.major.xs).toEqual([0, 128, 256]);
    // 뷰포트가 맵 밖만 보면 없음
    expect(tileGridLines({ zoom: 1, panX: -2000, panY: 0 }, { width: 100, height: 100 }, 16, 16, map)).toBeNull();
  });
});
