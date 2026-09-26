import { describe, expect, it } from "vitest";
import { MemoryBackend } from "@initial-editor/core";
import { MapDocument, parseMap, parseObjectSchema, singleBrush } from "@initial-editor/ext-tilemap/model";
import { MapToolController, type ToolPointer } from "./mapTools";

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
