import { describe, expect, it } from "vitest";
import { cellCenter, insideBox, pageToWorld, pickStrokeCells, visibleWorldRect, worldToPage } from "./view";

describe("맵 뷰 좌표", () => {
  const box = { x: 100, y: 50, width: 400, height: 300 };
  const t = { zoom: 2, panX: 24, panY: -10 };

  it("월드와 페이지를 오간다 (screen = world * zoom + pan, 캔버스 상자 기준)", () => {
    expect(worldToPage(box, t, { x: 10, y: 20 })).toEqual({ x: 144, y: 80 });
    expect(pageToWorld(box, t, worldToPage(box, t, { x: 13.5, y: 7 }))).toEqual({ x: 13.5, y: 7 });
  });

  it("캔버스에 보이는 월드 영역", () => {
    expect(visibleWorldRect(box, t)).toEqual({ x0: -12, y0: 5, x1: 188, y1: 155 });
  });

  it("상자 안 판정은 inset만큼 안쪽이다", () => {
    expect(insideBox(box, { x: 100, y: 50 })).toBe(true);
    expect(insideBox(box, { x: 100, y: 50 }, 1)).toBe(false);
    expect(insideBox(box, { x: 484, y: 334 }, 16)).toBe(true);
    expect(insideBox(box, { x: 485, y: 200 }, 16)).toBe(false);
    expect(insideBox(box, { x: 300, y: 401 })).toBe(false);
  });

  it("칸 가운데", () => {
    expect(cellCenter({ tileWidth: 16, tileHeight: 8 }, { x: 3, y: 2 })).toEqual({ x: 56, y: 20 });
  });
});

describe("붓질할 칸 고르기", () => {
  const grid = { width: 256, height: 28, tileWidth: 16, tileHeight: 16 };

  it("preferredRow가 보이면 그 줄이고, 칸은 보이는 범위의 가운데다", () => {
    const rect = visibleWorldRect({ x: 0, y: 0, width: 600, height: 480 }, { zoom: 1, panX: 24, panY: 24 });
    expect(pickStrokeCells(rect, grid, { preferredRow: 25, length: 3 })).toEqual([
      { x: 16, y: 25 },
      { x: 17, y: 25 },
      { x: 18, y: 25 },
    ]);
  });

  it("preferredRow가 안 보이면 칸 전체가 보이는 마지막 줄이다", () => {
    const rect = visibleWorldRect({ x: 0, y: 0, width: 600, height: 300 }, { zoom: 1, panX: 24, panY: 24 });
    // 월드 y -24..276: 줄 16 (256..272)이 칸 전체가 보이는 마지막 줄
    expect(pickStrokeCells(rect, grid, { preferredRow: 25, length: 3 }).map((c) => c.y)).toEqual([16, 16, 16]);
  });

  it("줌이 있어도 칸 전체가 보이는 것만 고른다", () => {
    const rect = visibleWorldRect({ x: 10, y: 10, width: 100, height: 100 }, { zoom: 2, panX: -40, panY: -40 });
    // 월드 20..70, 20..70: 칸 2..3 (x 32..64), 줄 2..3
    expect(pickStrokeCells(rect, grid, { preferredRow: 25, length: 2 })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
  });

  it("맵 오른끝이 보이는 뷰에서는 맵 안의 칸만 고른다", () => {
    const rect = visibleWorldRect({ x: 0, y: 0, width: 300, height: 480 }, { zoom: 1, panX: -3900, panY: 0 });
    expect(pickStrokeCells(rect, grid, { preferredRow: 25, length: 3 }).map((c) => c.x)).toEqual([248, 249, 250]);
  });

  it("보이는 칸이 모자라면 예외", () => {
    const narrow = visibleWorldRect({ x: 0, y: 0, width: 40, height: 480 }, { zoom: 1, panX: 24, panY: 24 });
    expect(() => pickStrokeCells(narrow, grid, { preferredRow: 25, length: 3 })).toThrow(/보이는 칸이 모자란다/);
    const above = visibleWorldRect({ x: 0, y: 0, width: 600, height: 480 }, { zoom: 1, panX: 24, panY: 900 });
    expect(() => pickStrokeCells(above, grid, { preferredRow: 25, length: 3 })).toThrow(/보이는 칸이 모자란다/);
  });
});
