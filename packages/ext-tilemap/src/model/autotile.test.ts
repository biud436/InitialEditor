import { describe, expect, it } from "vitest";
import {
  BLOB_BITS,
  BLOB_CELLS,
  BLOB_LAYOUTS,
  BLOB_MASKS,
  blobGid,
  blobMaskAt,
  blobSheetProblem,
  blobTileIndex,
  blobTilePosition,
  neighborMask,
  reduceBlobMask,
} from "./autotile";
import * as model from "./index";

const { N, NE, E, SE, S, SW, W, NW } = BLOB_BITS;

/** 글자 격자에서 '#'이 지형인 맵 (행 우선, 1과 0) */
function grid(rows: string[]): { data: number[]; width: number; height: number } {
  return { data: rows.flatMap((r) => [...r].map((c) => (c === "#" ? 1 : 0))), width: rows[0].length, height: rows.length };
}

describe("오토타일 마스크", () => {
  it("모서리는 닿은 두 변이 다 이어졌을 때만 남고, 줄인 마스크는 47가지다", () => {
    expect(reduceBlobMask(NE)).toBe(0);
    expect(reduceBlobMask(N | NE)).toBe(N);
    expect(reduceBlobMask(N | NE | E)).toBe(N | NE | E);
    expect(reduceBlobMask(S | SW | W | NW)).toBe(S | SW | W);
    expect(reduceBlobMask(0xff)).toBe(0xff);
    expect(reduceBlobMask(0x1ff)).toBe(0xff);
    expect(BLOB_MASKS).toHaveLength(47);
    for (const m of BLOB_MASKS) expect(reduceBlobMask(m)).toBe(m);
  });

  it("두 배치 표는 48칸이고 47가지 마스크를 전부 담는다", () => {
    for (const table of Object.values(BLOB_LAYOUTS)) {
      expect(table).toHaveLength(BLOB_CELLS);
      expect(new Set(table).size).toBe(47);
      expect([...new Set(table)].sort((a, b) => a - b)).toEqual(BLOB_MASKS);
    }
  });

  it("이웃 함수의 방향이 비트와 맞는다 (y는 아래로)", () => {
    expect(neighborMask((dx, dy) => dx === 0 && dy === -1)).toBe(N);
    expect(neighborMask((dx, dy) => dx === 1 && dy === 0)).toBe(E);
    expect(neighborMask((dx, dy) => dx === 0 && dy === 1)).toBe(S);
    expect(neighborMask((dx, dy) => dx === -1 && dy === 0)).toBe(W);
    // 모서리만 있으면 줄여서 사라진다
    expect(neighborMask((dx, dy) => dx !== 0 && dy !== 0)).toBe(0);
    expect(neighborMask(() => true)).toBe(0xff);
  });

  it("맵 배열에서 칸의 마스크를 센다. 맵 밖은 outside로 본다", () => {
    const g = grid(["....", ".##.", ".##.", "...."]);
    const isSame = (v: number) => v === 1;
    // (1,1)의 이웃: 동, 남동, 남
    expect(blobMaskAt(g.data, g.width, g.height, 1, 1, isSame)).toBe(E | SE | S);
    expect(blobMaskAt(g.data, g.width, g.height, 2, 2, isSame)).toBe(N | W | NW);
    const full = grid(["##", "##"]);
    expect(blobMaskAt(full.data, 2, 2, 0, 0, isSame)).toBe(0xff);
    expect(blobMaskAt(full.data, 2, 2, 0, 0, isSame, false)).toBe(E | SE | S);
  });
});

describe("시트 칸", () => {
  it("rmCustom: 가운데는 첫 칸, 외딴 칸은 마지막 줄의 0 중 앞 칸", () => {
    expect(blobTileIndex(0xff)).toBe(0);
    expect(blobTileIndex(0)).toBe(46);
    expect(blobTilePosition(46)).toEqual({ col: 6, row: 5 });
    expect(blobTileIndex(N | E | SE | S)).toBe(17);
    // 줄이지 않은 마스크도 먼저 줄여서 찾는다
    expect(blobTileIndex(N | NE)).toBe(blobTileIndex(N));
  });

  it("wang 배치는 같은 마스크를 다른 칸에 둔다", () => {
    expect(blobTileIndex(0xff, "wang")).toBe(13);
    expect(blobTileIndex(0, "wang")).toBe(40);
    for (const m of BLOB_MASKS) expect(BLOB_LAYOUTS.wang[blobTileIndex(m, "wang")]).toBe(m);
  });

  it("타일셋 안에 놓인 시트의 gid", () => {
    const tileset = { firstGid: 1, columns: 16 };
    expect(blobGid(tileset, { col: 0, row: 0 }, 0xff)).toBe(1);
    // 외딴 칸 (열 6, 행 5), 시트가 (8, 2)에서 시작한다
    expect(blobGid(tileset, { col: 8, row: 2 }, 0)).toBe(1 + (2 + 5) * 16 + 8 + 6);
    expect(blobGid({ firstGid: 101, columns: 8 }, { col: 0, row: 0 }, 0xff, "wang")).toBe(101 + 13);
  });

  it("시트 크기를 검사한다", () => {
    expect(blobSheetProblem(128, 96, 16, 16)).toBeNull();
    expect(blobSheetProblem(96, 128, 16, 16)).toMatch(/너비가 높이보다 커야 함/);
    expect(blobSheetProblem(64, 64, 16, 16)).toMatch(/너비가 높이보다 커야 함/);
    expect(blobSheetProblem(256, 96, 16, 16)).toMatch(/128x96/);
    expect(blobSheetProblem(128, 96, 0, 16)).toMatch(/0보다/);
  });

  it("모델 입구(model/index)에서 가져올 수 있다", () => {
    expect(model.blobGid).toBe(blobGid);
    expect(model.BLOB_LAYOUTS).toBe(BLOB_LAYOUTS);
  });
});
