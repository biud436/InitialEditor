// 아틀라스 배치(atlas.ts)와 굽기(bake.ts). 검사용 ChipSet(testChipset.ts)을 구워 칸마다 네 조각이 ChipSet 의 어느 조각에서
// 왔는지 읽고, docs/plans/rm2k-tilemap.md 의 배치표대로인지 본다.
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "@initial-editor/core";
import {
  animLocal,
  ATLAS_HEIGHT,
  ATLAS_TILES,
  ATLAS_WIDTH,
  atlasAnimations,
  C_START,
  chipAt,
  D_SAMPLE,
  dLocal,
  eLocal,
  fLocal,
  W_FRAME_STRIDE,
  W_START,
  waterLocal,
} from "./atlas";
import { bakeAtlas, chipsetPixels, ChipsetError } from "./bake";
import { ATLAS_COLUMNS } from "./atlas";
import { codedChipset, codedQuarterAt } from "./testChipset";

const atlas = bakeAtlas(codedChipset());

/** 아틀라스 칸 local 의 네 조각 (왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래)이 온 ChipSet 조각 자리 */
function quartersOf(image: RgbaImage, local: number): Array<[number, number] | null> {
  const x0 = (local % ATLAS_COLUMNS) * 16;
  const y0 = Math.floor(local / ATLAS_COLUMNS) * 16;
  return [
    [4, 4],
    [12, 4],
    [4, 12],
    [12, 12],
  ].map(([dx, dy]) => {
    const q = codedQuarterAt(image, x0 + dx, y0 + dy);
    return q ? [q.qx, q.qy] : null;
  });
}

/** ChipSet 타일 (tx, ty) 를 통째로 쓴 칸의 네 조각 */
function wholeTile(tx: number, ty: number): Array<[number, number]> {
  return [
    [tx * 2, ty * 2],
    [tx * 2 + 1, ty * 2],
    [tx * 2, ty * 2 + 1],
    [tx * 2 + 1, ty * 2 + 1],
  ];
}

describe("아틀라스 배치", () => {
  it("크기는 48열 79줄이고 칸 번호와 ChipSet 칸이 서로 돌아온다", () => {
    expect(atlas.width).toBe(ATLAS_WIDTH);
    expect(atlas.height).toBe(ATLAS_HEIGHT);
    expect(ATLAS_WIDTH).toBe(768);
    expect(ATLAS_HEIGHT).toBe(79 * 16);
    expect(ATLAS_TILES).toBe(3792);
    expect(chipAt(eLocal(143))).toEqual({ kind: "e", id: 143 });
    expect(chipAt(fLocal(0))).toEqual({ kind: "f", id: 0 });
    expect(chipAt(dLocal(11, D_SAMPLE))).toEqual({ kind: "d", n: 11, variant: D_SAMPLE });
    expect(chipAt(animLocal(2, 3))).toEqual({ kind: "anim", n: 2, frame: 3 });
    expect(chipAt(waterLocal(2, 0, 15, 2))?.kind).toBe("water");
    // 줄 끝을 채운 자리는 빈 칸이다
    expect(chipAt(C_START + 12)).toBeNull();
    expect(chipAt(W_START + 918)).toBeNull();
    expect(chipAt(ATLAS_TILES)).toBeNull();
  });

  it("물의 프레임은 한 묶음(960칸)씩 떨어져 있고 animations 는 범위 둘이다", () => {
    expect(waterLocal(1, 5, 0, 2) - waterLocal(1, 5, 0, 0)).toBe(2 * W_FRAME_STRIDE);
    expect(atlasAnimations({ pattern: "pingpong", speed: "normal" })).toEqual([
      { tile: C_START, count: 3, frames: [C_START, C_START + 3, C_START + 6, C_START + 9], duration: 100 },
      { tile: W_START, count: 918, frames: [W_START, W_START + 960, W_START + 1920, W_START + 960], duration: 400 },
    ]);
    expect(atlasAnimations({ pattern: "loop", speed: "fast" })[1]).toEqual({ tile: W_START, count: 918, frames: [W_START, W_START + 960, W_START + 1920], duration: 200 });
  });
});

describe("bakeAtlas", () => {
  it("하층과 상층 타일은 ChipSet 의 6열 줄에서 통째로 온다", () => {
    expect(quartersOf(atlas, eLocal(0))).toEqual(wholeTile(12, 0));
    expect(quartersOf(atlas, eLocal(95))).toEqual(wholeTile(17, 15));
    expect(quartersOf(atlas, eLocal(96))).toEqual(wholeTile(18, 0));
    expect(quartersOf(atlas, fLocal(0))).toEqual(wholeTile(18, 8));
    expect(quartersOf(atlas, fLocal(48))).toEqual(wholeTile(24, 0));
    expect(quartersOf(atlas, fLocal(143))).toEqual(wholeTile(29, 15));
  });

  it("땅 오토타일은 덩어리 안의 원본 타일에서 같은 자리 조각을 모은다", () => {
    // D1 은 (0, 128): 타일 (0, 8). 모양 0 은 가운데(1, 2) 넷, 46 은 네 모서리 타일의 제 모서리 조각
    expect(quartersOf(atlas, dLocal(0, 0))).toEqual(wholeTile(1, 10));
    expect(quartersOf(atlas, dLocal(0, 46))).toEqual([
      [0, 18],
      [5, 18],
      [0, 23],
      [5, 23],
    ]);
    expect(quartersOf(atlas, dLocal(0, D_SAMPLE))).toEqual(wholeTile(0, 8));
    // D5 는 (96, 0): 타일 (6, 0). 모양 1 은 왼쪽 위만 안쪽 모서리(2, 0)
    expect(quartersOf(atlas, dLocal(4, 1))).toEqual([
      [16, 0],
      [15, 4],
      [14, 5],
      [15, 5],
    ]);
  });

  it("물은 프레임 열의 물가와 몸통에서, 깊은 물은 A1 의 물가에서 온다", () => {
    // 물 A2, 외딴 칸(46), 프레임 1: 물가 열은 x = 48 + 16 = 64 (조각 열 8), 줄 0 의 네 조각
    expect(quartersOf(atlas, waterLocal(1, 46, 0, 1))).toEqual(wholeTile(4, 0));
    // 깊은 물, 사방이 물(0), 모서리 없음, 프레임 2: 깊은 몸통 줄 (y 112), 열 x 32
    expect(quartersOf(atlas, waterLocal(2, 0, 0, 2))).toEqual(wholeTile(2, 7));
    // 깊은 물, 네 모서리 비트: 얕은 모서리가 든 깊은 몸통 (y 96)
    expect(quartersOf(atlas, waterLocal(2, 0, 15, 0))).toEqual(wholeTile(0, 6));
    // 얕은 물 A1, 서쪽 물가(16) + 오른쪽 아래 모서리 비트(8): 왼쪽은 세로 물가(줄 1), 오른쪽 위는 몸통, 오른쪽 아래는 깊은 모서리 몸통
    expect(quartersOf(atlas, waterLocal(0, 16, 8, 0))).toEqual([
      [0, 2],
      [1, 8],
      [0, 3],
      [1, 11],
    ]);
    // 깊은 물 외딴 칸도 A1 의 물가를 쓴다
    expect(quartersOf(atlas, waterLocal(2, 46, 0, 0))).toEqual(quartersOf(atlas, waterLocal(0, 46, 0, 0)));
  });

  it("애니메이션 타일은 세로 프레임 넷이다", () => {
    expect(quartersOf(atlas, animLocal(0, 0))).toEqual(wholeTile(3, 4));
    expect(quartersOf(atlas, animLocal(2, 3))).toEqual(wholeTile(5, 7));
  });
});

describe("chipsetPixels", () => {
  it("크기가 다르면 ChipsetError", () => {
    expect(() => chipsetPixels({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4), indices: null })).toThrow(ChipsetError);
  });

  it("팔레트 그림은 0번 색이 투명이다 (tRNS 가 없어도)", () => {
    const base = codedChipset();
    const indices = new Uint8Array(480 * 256).fill(1);
    indices[0] = 0;
    const out = chipsetPixels({ ...base, indices });
    expect(out.data[3]).toBe(0);
    expect(out.data[7]).toBe(255);
  });

  it("알파가 없는 그림은 F0 왼쪽 위 픽셀의 색이 투명이다", () => {
    const base = codedChipset();
    const out = chipsetPixels({ ...base, indices: null });
    const at = (x: number, y: number) => out.data[(y * 480 + x) * 4 + 3];
    // (288, 128) 이 든 조각만 그 색이다
    expect(at(288, 128)).toBe(0);
    expect(at(295, 135)).toBe(0);
    expect(at(296, 128)).toBe(255);
  });

  it("알파가 있는 그림은 그대로 쓴다", () => {
    const base = codedChipset();
    base.data[3] = 0;
    const out = chipsetPixels({ ...base, indices: null });
    expect(out.data[3]).toBe(0);
    expect(out.data[(128 * 480 + 288) * 4 + 3]).toBe(255);
  });
});
