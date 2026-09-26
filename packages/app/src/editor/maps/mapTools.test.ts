import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryBackend } from "@initial-editor/core";
import { MapDocument, parseMap, parseObjectSchema, singleBrush, validateObjects } from "@initial-editor/ext-tilemap/model";
import { HIDDEN_TARGET_NOTICE, MapToolController, type ToolPointer } from "./mapTools";

const W = 10;
const H = 6;

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
          { name: "minX", type: "number", role: "rangeMin" },
          { name: "maxX", type: "number", role: "rangeMax" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
      { type: "landmark", label: "흔적", shape: "band", defaultWidth: 48 },
    ],
  }),
);

function makeDoc(): MapDocument {
  const data = parseMap(
    JSON.stringify({
      version: 2,
      name: "t",
      width: W,
      height: H,
      tileWidth: 16,
      tileHeight: 16,
      layers: [
        { name: "ground", data: new Array(W * H).fill(1) },
        { name: "deco", data: new Array(W * H).fill(0) },
      ],
      tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8 }],
      objects: [
        { id: "wolf", type: "spawn", x: 80, y: 40, props: { species: "wolf", minX: 40, maxX: 120 } },
        { id: "tracks", type: "landmark", x: 100, y: 0, width: 32 },
        { id: "start", type: "start", x: 16, y: 80 },
      ],
    }),
  );
  return new MapDocument(new MemoryBackend(), "resources/maps/t.json", data, SCHEMA);
}

function setup() {
  const doc = makeDoc();
  let changes = 0;
  const tools = new MapToolController({ document: doc, zoom: () => 1, changed: () => void changes++ });
  const at = (x: number, y: number, extra: Partial<ToolPointer> = {}): ToolPointer => ({ world: { x, y }, button: 0, shift: false, alt: false, ...extra });
  /** 칸 가운데를 누르고 칸들을 지나 놓는다 */
  const dragCells = (cells: Array<[number, number]>, extra: Partial<ToolPointer> = {}) => {
    const [first, ...rest] = cells.map(([cx, cy]) => at(cx * 16 + 8, cy * 16 + 8, extra));
    tools.pointerDown(first);
    for (const p of rest) tools.pointerMove(p);
    tools.pointerUp(rest[rest.length - 1] ?? first);
  };
  const drag = (from: [number, number], to: [number, number], extra: Partial<ToolPointer> = {}) => {
    tools.pointerDown(at(from[0], from[1], extra));
    tools.pointerMove(at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, extra));
    tools.pointerMove(at(to[0], to[1], extra));
    tools.pointerUp(at(to[0], to[1], extra));
  };
  return { doc, tools, at, dragCells, drag, changes: () => changes };
}

const ground = (doc: MapDocument) => doc.model.layers[0].data;

describe("타일 도구", () => {
  it("펜: 한 번의 끌기는 되돌리기 한 단계이고, 건너뛴 칸도 칠한다", () => {
    const { doc, dragCells } = setup();
    doc.setBrush(singleBrush(5));
    dragCells([[0, 0], [3, 0], [3, 2]]);
    expect(ground(doc).slice(0, 4)).toEqual([5, 5, 5, 5]);
    expect(ground(doc)[1 * W + 3]).toBe(5);
    expect(ground(doc)[2 * W + 3]).toBe(5);
    expect(doc.undo.depth).toBe(1);
    doc.undo.undo();
    expect(ground(doc).every((v) => v === 1)).toBe(true);
    expect(doc.dirty).toBe(false);
  });

  it("숨긴 레이어에는 칠하지 않고 알린다. 붓 미리보기 없이 금지 커서다", () => {
    const doc = makeDoc();
    const notices: string[] = [];
    const tools = new MapToolController({ document: doc, zoom: () => 1, changed: () => {}, notice: (m) => notices.push(m) });
    const at = (x: number, y: number): ToolPointer => ({ world: { x, y }, button: 0, shift: false, alt: false });
    doc.setTarget({ kind: "layer", index: 1 });
    doc.toggleLayer(1);
    doc.setBrush(singleBrush(5));
    tools.pointerMove(at(8, 8));
    expect(tools.preview).toEqual({ kind: "none" });
    expect(tools.cursor).toBe("not-allowed");
    for (const tool of ["pen", "rect", "fill", "erase"] as const) {
      doc.setTool(tool);
      tools.pointerDown(at(8, 8));
      tools.pointerMove(at(40, 8));
      tools.pointerUp(at(40, 8));
    }
    expect(doc.model.layers[1].data.every((v) => v === 0)).toBe(true);
    expect(doc.undo.depth).toBe(0);
    expect(doc.dirty).toBe(false);
    expect(notices).toEqual([HIDDEN_TARGET_NOTICE, HIDDEN_TARGET_NOTICE, HIDDEN_TARGET_NOTICE, HIDDEN_TARGET_NOTICE]);
    // 숨긴 통행도 칠하지 않는다
    doc.setTool("collision");
    doc.showCollision = false;
    tools.pointerDown(at(8, 8));
    tools.pointerUp(at(8, 8));
    expect(doc.model.collision).toBeNull();
    // 다시 보이면 칠한다
    doc.toggleLayer(1);
    doc.setTarget({ kind: "layer", index: 1 });
    doc.setTool("pen");
    tools.pointerDown(at(8, 8));
    tools.pointerUp(at(8, 8));
    expect(doc.model.layers[1].data[0]).toBe(5);
  });

  it("같은 값을 찍으면 명령이 없다 (문서가 더러워지지 않는다)", () => {
    const { doc, dragCells } = setup();
    doc.setBrush(singleBrush(1));
    dragCells([[0, 0], [2, 0]]);
    expect(doc.undo.depth).toBe(0);
    expect(doc.dirty).toBe(false);
  });

  it("두 번의 붓질은 두 단계", () => {
    const { doc, dragCells } = setup();
    doc.setBrush(singleBrush(5));
    dragCells([[0, 0], [1, 0]]);
    dragCells([[0, 1], [1, 1]]);
    expect(doc.undo.depth).toBe(2);
    doc.undo.undo();
    expect(ground(doc).slice(0, 2)).toEqual([5, 5]);
    expect(ground(doc).slice(W, W + 2)).toEqual([1, 1]);
  });

  it("사각형: 끄는 동안 미리보기, 놓을 때 무늬로 한 번에", () => {
    const { doc, tools, at } = setup();
    doc.setBrush({ width: 2, height: 1, gids: [[7, 8]] });
    doc.setTool("rect");
    tools.pointerDown(at(1 * 16 + 4, 1 * 16 + 4));
    tools.pointerMove(at(3 * 16 + 4, 2 * 16 + 4));
    expect(tools.preview).toMatchObject({ kind: "cells", x0: 1, y0: 1, x1: 3, y1: 2, fill: true });
    expect(doc.undo.depth).toBe(0);
    tools.pointerUp(at(3 * 16 + 4, 2 * 16 + 4));
    expect(ground(doc).slice(W + 1, W + 4)).toEqual([7, 8, 7]);
    expect(ground(doc).slice(2 * W + 1, 2 * W + 4)).toEqual([7, 8, 7]);
    expect(doc.undo.depth).toBe(1);
  });

  it("채우기와 지우개", () => {
    const { doc, tools, at, dragCells } = setup();
    doc.setBrush(singleBrush(9));
    doc.setTarget({ kind: "layer", index: 1 });
    doc.setTool("fill");
    tools.pointerDown(at(20, 20));
    tools.pointerUp(at(20, 20));
    expect(doc.model.layers[1].data.every((v) => v === 9)).toBe(true);
    doc.setTool("erase");
    dragCells([[0, 0], [2, 0]]);
    expect(doc.model.layers[1].data.slice(0, 4)).toEqual([0, 0, 0, 9]);
    expect(doc.undo.depth).toBe(2);
  });

  it("스포이드: 사각형을 떠서 붓으로 하고 펜으로 돌아간다", () => {
    const { doc, tools, at, dragCells } = setup();
    doc.setBrush(singleBrush(4));
    dragCells([[1, 0]]);
    doc.setTool("pick");
    tools.pointerDown(at(8, 8));
    tools.pointerMove(at(24, 8));
    tools.pointerUp(at(24, 8));
    expect(doc.brush).toEqual({ width: 2, height: 1, gids: [[1, 4]] });
    expect(doc.tool).toBe("pen");
    expect(doc.target).toEqual({ kind: "layer", index: 0 });
  });

  it("붓 미리보기는 호버한 칸을 따라온다", () => {
    const { doc, tools, at } = setup();
    doc.setBrush(singleBrush(3));
    tools.pointerMove(at(40, 20));
    expect(tools.preview).toMatchObject({ kind: "brush", cell: { x: 2, y: 1 } });
    tools.pointerLeave();
    expect(tools.preview).toEqual({ kind: "none" });
    tools.pointerMove(at(-5, 20));
    expect(tools.preview).toEqual({ kind: "none" });
  });
});

describe("통행 도구", () => {
  it("왼쪽은 막힘, 오른쪽과 Alt는 지나감. 통행이 없던 맵에 만든다", () => {
    const { doc, tools, dragCells } = setup();
    expect(doc.model.collision).toBeNull();
    doc.setTool("collision");
    expect(tools.wantsRightButton()).toBe(true);
    dragCells([[0, 0], [3, 0]]);
    expect(doc.model.collision!.slice(0, 5)).toEqual([1, 1, 1, 1, 0]);
    dragCells([[1, 0]], { button: 2 });
    dragCells([[2, 0]], { alt: true });
    expect(doc.model.collision!.slice(0, 5)).toEqual([1, 0, 0, 1, 0]);
    expect(doc.undo.depth).toBe(3);
    for (let i = 0; i < 3; i++) doc.undo.undo();
    expect(doc.model.collision).toBeNull();
  });

  it("대상이 통행이면 지우개는 지나감을 칠하고, 타일 레이어에서는 오른쪽 버튼을 팬에 준다", () => {
    const { doc, tools, dragCells } = setup();
    doc.setTool("collision");
    dragCells([[0, 0]]);
    doc.setTool("erase");
    expect(doc.target.kind).toBe("collision");
    dragCells([[0, 0]]);
    expect(doc.model.collision![0]).toBe(0);
    doc.setTarget({ kind: "layer", index: 0 });
    expect(tools.wantsRightButton()).toBe(false);
  });
});

describe("오브젝트 도구", () => {
  it("클릭 선택, Shift 더하기와 빼기, 빈 곳 클릭은 풀기, Escape", () => {
    const { doc, tools, at } = setup();
    doc.setTool("object");
    tools.pointerDown(at(81, 41));
    tools.pointerUp(at(81, 41));
    expect(doc.selectedIds).toEqual(["wolf"]);
    tools.pointerDown(at(16, 80, { shift: true }));
    tools.pointerUp(at(16, 80, { shift: true }));
    expect(doc.selectedIds).toEqual(["wolf", "start"]);
    tools.pointerDown(at(16, 80, { shift: true }));
    tools.pointerUp(at(16, 80, { shift: true }));
    expect(doc.selectedIds).toEqual(["wolf"]);
    tools.pointerDown(at(60, 90));
    tools.pointerUp(at(60, 90));
    expect(doc.selectedIds).toEqual([]);
    doc.select(["wolf"]);
    expect(tools.keyDown({ key: "Escape", shift: false, alt: false, mod: false })).toBe(true);
    expect(doc.selectedIds).toEqual([]);
  });

  it("끌기는 고른 것 전부를 정수 픽셀로 옮기고 되돌리기 한 단계다. 띠는 가로로만", () => {
    const { doc, drag } = setup();
    doc.setTool("object");
    doc.select(["wolf", "tracks"]);
    drag([80, 40], [97.4, 52.2]);
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 97, y: 52 });
    expect(doc.model.findObject("tracks")).toMatchObject({ x: 117, y: 0 });
    expect(doc.undo.depth).toBe(1);
    doc.undo.undo();
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 80, y: 40 });
  });

  it("조금 움직인 클릭은 끌기가 아니다", () => {
    const { doc, drag } = setup();
    doc.setTool("object");
    drag([80, 40], [81, 41]);
    expect(doc.undo.depth).toBe(0);
    expect(doc.selectedIds).toEqual(["wolf"]);
  });

  it("범위 손잡이 끌기는 minX와 maxX를 고치고 한 단계다", () => {
    const { doc, drag } = setup();
    doc.setTool("object");
    drag([40, 44], [12.4, 44]);
    expect(doc.model.findObject("wolf")!.props).toMatchObject({ minX: 12, maxX: 120 });
    drag([120, 40], [300, 40]);
    // 맵 폭(160)에서 잘린다
    expect(doc.model.findObject("wolf")!.props).toMatchObject({ minX: 12, maxX: 160 });
    expect(doc.undo.depth).toBe(2);
    doc.undo.undo();
    doc.undo.undo();
    expect(doc.model.findObject("wolf")!.props).toMatchObject({ minX: 40, maxX: 120 });
  });

  it("띠 가장자리 끌기는 x와 폭을 고치고 한 단계다", () => {
    const { doc, drag } = setup();
    doc.setTool("object");
    drag([132, 60], [150, 60]);
    expect(doc.model.findObject("tracks")).toMatchObject({ x: 100, width: 50 });
    drag([100, 60], [90, 60]);
    expect(doc.model.findObject("tracks")).toMatchObject({ x: 90, width: 60 });
    expect(doc.undo.depth).toBe(2);
    doc.undo.undo();
    expect(doc.model.findObject("tracks")).toMatchObject({ x: 100, width: 50 });
    doc.undo.undo();
    expect(doc.model.findObject("tracks")).toMatchObject({ x: 100, width: 32 });
  });

  it("빈 곳에서 끌면 상자 선택", () => {
    const { doc, tools, drag } = setup();
    doc.setTool("object");
    drag([4, 30], [90, 90]);
    expect(doc.selectedIds.sort()).toEqual(["start", "wolf"]);
    expect(tools.preview).toEqual({ kind: "none" });
  });

  it("방향키는 1px, Shift는 한 칸, Delete는 지우고 되돌리면 돌아온다", () => {
    const { doc, tools } = setup();
    doc.setTool("object");
    doc.select(["wolf"]);
    const key = (k: string, shift = false) => tools.keyDown({ key: k, shift, alt: false, mod: false });
    expect(key("ArrowRight")).toBe(true);
    expect(key("ArrowDown", true)).toBe(true);
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 81, y: 56 });
    expect(key("Delete")).toBe(true);
    expect(doc.model.findObject("wolf")).toBeUndefined();
    expect(doc.selectedIds).toEqual([]);
    doc.undo.undo();
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 81, y: 56 });
    // 다른 도구에서는 방향키를 쓰지 않는다
    doc.setTool("pen");
    doc.select(["wolf"]);
    expect(key("ArrowLeft")).toBe(false);
  });

  it("오브젝트를 숨기면 고르지 않는다", () => {
    const { doc, tools, at } = setup();
    doc.setTool("object");
    doc.showObjects = false;
    tools.pointerDown(at(80, 40));
    tools.pointerUp(at(80, 40));
    expect(doc.selectedIds).toEqual([]);
  });

  it("커서 모양: 몸통은 move, 손잡이는 ew-resize, 타일 도구는 crosshair", () => {
    const { doc, tools, at } = setup();
    doc.setTool("object");
    tools.pointerMove(at(80, 40));
    expect(tools.cursor).toBe("move");
    tools.pointerMove(at(40, 40));
    expect(tools.cursor).toBe("ew-resize");
    tools.pointerMove(at(60, 90));
    expect(tools.cursor).toBe("default");
    doc.setTool("pen");
    tools.refresh();
    expect(tools.cursor).toBe("crosshair");
  });
});

describe("오브젝트 도구: 손잡이와 범위", () => {
  it("범위 손잡이를 누르고 문턱 아래로 떨린 클릭은 값을 바꾸지 않는다", () => {
    const { doc, tools, at } = setup();
    doc.setTool("object");
    tools.pointerDown(at(45, 40));
    tools.pointerMove(at(45.5, 40));
    tools.pointerUp(at(45.5, 40));
    expect(doc.model.findObject("wolf")!.props).toMatchObject({ minX: 40, maxX: 120 });
    expect(doc.undo.depth).toBe(0);
    expect(doc.dirty).toBe(false);
    expect(doc.selectedIds).toEqual(["wolf"]);
  });

  it("띠 가장자리를 누르고 문턱 아래로 떨린 클릭은 폭을 바꾸지 않는다", () => {
    const { doc, tools, at } = setup();
    doc.setTool("object");
    tools.pointerDown(at(129, 60));
    tools.pointerMove(at(129.5, 60));
    tools.pointerUp(at(129.5, 60));
    expect(doc.model.findObject("tracks")).toMatchObject({ x: 100, width: 32 });
    expect(doc.undo.depth).toBe(0);
  });

  it("손잡이 끌기는 누른 점과의 차이만큼 옮긴다 (손잡이가 커서로 튀지 않는다)", () => {
    const { doc, drag } = setup();
    doc.setTool("object");
    drag([45, 40], [55, 40]);
    expect(doc.model.findObject("wolf")!.props).toMatchObject({ minX: 50 });
    drag([129, 60], [139, 60]);
    expect(doc.model.findObject("tracks")).toMatchObject({ x: 100, width: 42 });
  });

  it("범위가 있는 점을 끌면 범위도 같이 옮기고 되돌리기 한 단계다. Alt는 몸통만", () => {
    const { doc, drag } = setup();
    doc.setTool("object");
    drag([80, 40], [110, 40]);
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 110, props: { minX: 70, maxX: 150 } });
    expect(doc.undo.depth).toBe(1);
    doc.undo.undo();
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 80, props: { minX: 40, maxX: 120 } });
    drag([80, 40], [100, 40], { alt: true });
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 100, props: { minX: 40, maxX: 120 } });
  });

  it("방향키로 옮겨도 범위가 같이 간다", () => {
    const { doc, tools } = setup();
    doc.setTool("object");
    doc.select(["wolf"]);
    tools.keyDown({ key: "ArrowRight", shift: true, alt: false, mod: false });
    expect(doc.model.findObject("wolf")).toMatchObject({ x: 96, props: { minX: 56, maxX: 136 } });
    expect(doc.undo.depth).toBe(1);
  });
});

describe("오브젝트 도구: 실제 맵 (aldebaran_forest)", () => {
  const dir = path.join(__dirname, "__fixtures__");
  const forestText = readFileSync(path.join(dir, "aldebaran_forest.json"), "utf8");
  const schema = parseObjectSchema(readFileSync(path.join(dir, "map-objects.json"), "utf8"));

  function forest(zoom = 1, viewWidth = 1200) {
    const doc = new MapDocument(new MemoryBackend(), "resources/maps/aldebaran_forest.json", parseMap(forestText), schema);
    doc.setTool("object");
    const tools = new MapToolController({ document: doc, zoom: () => zoom, viewWidth: () => viewWidth, changed: () => {} });
    const at = (x: number, y: number, extra: Partial<ToolPointer> = {}): ToolPointer => ({ world: { x, y }, button: 0, shift: false, alt: false, ...extra });
    const x = (id: string) => doc.model.findObject(id)!.x;
    return { doc, tools, at, x };
  }

  it("흔적 띠의 안쪽을 끌면 흔적이 옮겨지고 구간은 그대로다", () => {
    const { doc, tools, at, x } = forest();
    tools.pointerDown(at(324, 200));
    tools.pointerMove(at(344, 200));
    tools.pointerMove(at(364, 200));
    tools.pointerUp(at(364, 200));
    expect(doc.selectedIds).toEqual(["tracks"]);
    expect(x("tracks")).toBe(340);
    expect(x("section_entrance")).toBe(0);
    expect(doc.undo.depth).toBe(1);
  });

  it("흔적 띠 안쪽 클릭은 둘러싼 구간이 아니라 흔적을 고른다", () => {
    const { doc, tools, at } = forest();
    tools.pointerDown(at(2464, 120));
    tools.pointerUp(at(2464, 120));
    expect(doc.selectedIds).toEqual(["cage"]);
  });

  it("구간만 덮은 빈 땅에서 끌면 상자 선택이고 아무것도 옮기지 않는다", () => {
    const { doc, tools, at, x } = forest();
    doc.select(["spawn_8"]);
    tools.pointerDown(at(2250, 250));
    tools.pointerMove(at(2290, 300));
    expect(tools.preview.kind).toBe("box");
    tools.pointerMove(at(2330, 340));
    tools.pointerUp(at(2330, 340));
    expect(doc.selectedIds).toEqual(["spawn_9"]);
    expect(x("section_gorge")).toBe(1599);
    expect(doc.undo.depth).toBe(0);
    expect(doc.dirty).toBe(false);
    expect(validateObjects(doc.model.objects, schema)).toEqual([]);
  });

  it("빈 땅에서 넓게 끈 상자는 가로로 다 든 흔적까지 고르고 구간은 고르지 않는다", () => {
    const { doc, tools, at, x } = forest();
    tools.pointerDown(at(100, 50));
    tools.pointerMove(at(250, 250));
    tools.pointerMove(at(400, 420));
    tools.pointerUp(at(400, 420));
    expect(doc.selectedIds.sort()).toEqual(["spawn_1", "tracks"]);
    expect(x("section_entrance")).toBe(0);
    expect(doc.undo.depth).toBe(0);
  });

  it("넓은 구간은 클릭하면 고르고, Shift 클릭은 더한다", () => {
    const { doc, tools, at } = forest();
    tools.pointerDown(at(100, 50));
    tools.pointerUp(at(100, 50));
    expect(doc.selectedIds).toEqual(["section_entrance"]);
    tools.pointerDown(at(1000, 50, { shift: true }));
    tools.pointerUp(at(1000, 50, { shift: true }));
    expect(doc.selectedIds).toEqual(["section_entrance", "section_road"]);
    // 고른 구간은 몸통을 끌어 옮긴다 (되돌리기 한 단계)
    doc.select(["section_entrance"]);
    tools.pointerDown(at(100, 50));
    tools.pointerMove(at(150, 50));
    tools.pointerMove(at(200, 50));
    tools.pointerUp(at(200, 50));
    expect(doc.model.findObject("section_entrance")!.x).toBe(100);
    expect(doc.undo.depth).toBe(1);
  });

  for (const zoom of [0.25, 0.5, 1, 2]) {
    it(`줌 ${zoom}: 고르지 않은 구간 안쪽을 끌면 상자 선택이고 구간은 그대로다`, () => {
      const { doc, tools, at, x } = forest(zoom);
      tools.pointerDown(at(2250, 250));
      tools.pointerMove(at(2290, 300));
      expect(tools.preview.kind).toBe("box");
      tools.pointerMove(at(2330, 340));
      tools.pointerUp(at(2330, 340));
      expect(x("section_gorge")).toBe(1599);
      expect(doc.undo.depth).toBe(0);
    });
  }

  it("맞닿은 구간의 경계는 누른 쪽 구간의 가장자리를 끈다", () => {
    const { doc, tools, at } = forest();
    tools.pointerDown(at(765, 200));
    tools.pointerMove(at(745, 200));
    tools.pointerUp(at(745, 200));
    expect(doc.model.findObject("section_entrance")).toMatchObject({ x: 0, width: 747 });
    expect(doc.model.findObject("section_road")).toMatchObject({ x: 767, width: 832 });
    doc.undo.undo();
    tools.pointerDown(at(769, 200));
    tools.pointerMove(at(789, 200));
    tools.pointerUp(at(789, 200));
    expect(doc.model.findObject("section_road")).toMatchObject({ x: 787, width: 812 });
    expect(doc.model.findObject("section_entrance")).toMatchObject({ x: 0, width: 767 });
  });

  it("구간 경계 근처를 문턱 아래로 떨며 클릭해도 구간이 바뀌지 않는다", () => {
    const { doc, tools, at } = forest(0.5);
    tools.pointerDown(at(761, 200));
    tools.pointerMove(at(762, 200));
    tools.pointerUp(at(762, 200));
    expect(doc.model.findObject("section_entrance")).toMatchObject({ x: 0, width: 767 });
    expect(doc.model.findObject("section_road")).toMatchObject({ x: 767, width: 832 });
    expect(doc.undo.depth).toBe(0);
  });

  it("늑대를 끌면 순찰 범위가 같이 가서 검사에 걸리지 않는다", () => {
    const { doc, tools, at } = forest();
    tools.pointerDown(at(1990, 304));
    tools.pointerMove(at(2020, 304));
    tools.pointerMove(at(2054, 304));
    tools.pointerUp(at(2054, 304));
    expect(doc.model.findObject("spawn_8")).toMatchObject({ x: 2054, props: { minX: 2014, maxX: 2094 } });
    expect(doc.undo.depth).toBe(1);
    expect(validateObjects(doc.model.objects, schema)).toEqual([]);
  });

  it("고르지 않은 큰 구간 위의 커서는 옮기기 모양이 아니고, 고르면 옮기기 모양이다", () => {
    const { doc, tools, at } = forest();
    tools.pointerMove(at(100, 50));
    expect(tools.cursor).toBe("default");
    doc.select(["section_entrance"]);
    tools.pointerMove(at(101, 50));
    expect(tools.cursor).toBe("move");
    tools.pointerMove(at(324, 200));
    expect(tools.cursor).toBe("move");
  });
});
