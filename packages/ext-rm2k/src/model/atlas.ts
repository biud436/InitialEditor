// 구운 아틀라스의 배치 (판 1). 엔진은 오토타일을 모르고 타일 하나를 통째로 그리므로, 에디터가 ChipSet 의 조각을 모아 모양마다
// 16x16 타일 한 장씩을 미리 그려 둔다 (bake.ts). 맵에는 이 아틀라스의 gid 가 적힌다. 48열이고 번호(타일셋 안의 번호)는:
//
//   0..143      하층 타일 E0..E143
//   144..287    상층 타일 F0..F143
//   288..863    땅 오토타일 D1..D12. 종류마다 48칸: 모양 0..46, 47 은 견본(팔레트 그림)
//   864..875    애니메이션 타일 C1..C3. 프레임 f 의 C(n+1) 은 864 + f*3 + n
//   912..       물. 프레임 f, 종류 k, 물 칸 t 는 912 + f*960 + k*306 + t (t 는 shapes.ts 의 WATER_TUPLES 순서)
//
// 물과 애니메이션 타일의 프레임은 엔진의 타일 애니메이션(타일셋의 animations, 범위 count)으로 넘긴다 (atlasAnimations).
// 판을 바꾸면 이미 그린 맵의 gid 가 다른 그림을 가리키므로, 배치를 바꿀 때는 ATLAS_VERSION 을 올린다.

import { ANIM_FRAMES, ANIM_TILES, D_KINDS, E_TILES, F_TILES, TILE, WATER_FRAMES, WATER_KINDS, type WaterKind } from "./chipset";
import { VARIANTS, WATER_TUPLES, waterTuple } from "./shapes";

export const ATLAS_VERSION = 1;
export const ATLAS_COLUMNS = 48;

export const E_START = 0;
export const F_START = E_START + E_TILES;
export const D_START = F_START + F_TILES;
export const D_STRIDE = 48;
/** D 종류 안의 견본 칸 */
export const D_SAMPLE = 47;
export const C_START = D_START + D_KINDS * D_STRIDE;
export const W_START = Math.ceil((C_START + ANIM_TILES * ANIM_FRAMES) / ATLAS_COLUMNS) * ATLAS_COLUMNS;
export const W_KIND_STRIDE = WATER_TUPLES.keys.length;
/** 물 한 프레임 묶음의 칸 수 (줄 끝까지 채운다) */
export const W_FRAME_STRIDE = Math.ceil((WATER_KINDS * W_KIND_STRIDE) / ATLAS_COLUMNS) * ATLAS_COLUMNS;
export const ATLAS_TILES = W_START + WATER_FRAMES * W_FRAME_STRIDE;
export const ATLAS_ROWS = ATLAS_TILES / ATLAS_COLUMNS;
export const ATLAS_WIDTH = ATLAS_COLUMNS * TILE;
export const ATLAS_HEIGHT = ATLAS_ROWS * TILE;

/** 아틀라스 칸 하나가 ChipSet 의 무엇인가 */
export type Chip =
  | { kind: "water"; water: WaterKind; tuple: number; frame: number }
  | { kind: "anim"; n: number; frame: number }
  | { kind: "d"; n: number; variant: number }
  | { kind: "e"; id: number }
  | { kind: "f"; id: number };

export function eLocal(id: number): number {
  return E_START + id;
}

export function fLocal(id: number): number {
  return F_START + id;
}

/** variant 0..46 은 모양, D_SAMPLE 은 견본 */
export function dLocal(n: number, variant: number): number {
  return D_START + n * D_STRIDE + variant;
}

export function animLocal(n: number, frame = 0): number {
  return C_START + frame * ANIM_TILES + n;
}

export function waterLocalByTuple(kind: WaterKind, tuple: number, frame = 0): number {
  return W_START + frame * W_FRAME_STRIDE + kind * W_KIND_STRIDE + tuple;
}

/** 물 칸: a 는 물가 모양(0..46), b 는 깊은 물과 얕은 물의 모서리 비트(0..15) */
export function waterLocal(kind: WaterKind, a: number, b: number, frame = 0): number {
  return waterLocalByTuple(kind, waterTuple(a, b), frame);
}

/** 아틀라스 번호가 가리키는 칸. 빈 칸(줄 끝을 채운 자리)이나 범위 밖이면 null */
export function chipAt(local: number): Chip | null {
  if (!Number.isInteger(local) || local < 0) return null;
  if (local < F_START) return { kind: "e", id: local - E_START };
  if (local < D_START) return { kind: "f", id: local - F_START };
  if (local < C_START) {
    const i = local - D_START;
    const variant = i % D_STRIDE;
    return variant < VARIANTS || variant === D_SAMPLE ? { kind: "d", n: Math.floor(i / D_STRIDE), variant } : null;
  }
  if (local < C_START + ANIM_TILES * ANIM_FRAMES) {
    const i = local - C_START;
    return { kind: "anim", n: i % ANIM_TILES, frame: Math.floor(i / ANIM_TILES) };
  }
  if (local < W_START || local >= ATLAS_TILES) return null;
  const i = local - W_START;
  const frame = Math.floor(i / W_FRAME_STRIDE);
  const j = i % W_FRAME_STRIDE;
  if (j >= WATER_KINDS * W_KIND_STRIDE) return null;
  return { kind: "water", water: Math.floor(j / W_KIND_STRIDE) as WaterKind, tuple: j % W_KIND_STRIDE, frame };
}

/** 타일셋의 animations 한 항목 (엔진 맵 포맷, 엔진 docs/plans/02-tilemap.md 의 타일 애니메이션) */
export interface TileAnimation {
  tile: number;
  count?: number;
  frames: number[];
  duration: number;
}

/** 물의 애니메이션: 왕복(0, 1, 2, 1)이나 한 방향(0, 1, 2). 빠르기는 프레임마다 400ms 와 200ms */
export interface WaterAnimation {
  pattern: "pingpong" | "loop";
  speed: "normal" | "fast";
}

export const DEFAULT_WATER_ANIMATION: WaterAnimation = { pattern: "pingpong", speed: "normal" };

/** 60fps 에서 RPG Maker 2000 의 물은 24 틱(빠르게는 12 틱)마다, 애니메이션 타일은 6 틱마다 다음 프레임이다 */
export const WATER_FRAME_MS = { normal: 400, fast: 200 } as const;
export const ANIM_FRAME_MS = 100;

/** 아틀라스의 animations: 애니메이션 타일 셋과 물 전부가 각각 범위 하나다 */
export function atlasAnimations(water: WaterAnimation): TileAnimation[] {
  const animFrames = Array.from({ length: ANIM_FRAMES }, (_, f) => animLocal(0, f));
  const order = water.pattern === "pingpong" ? [0, 1, 2, 1] : [0, 1, 2];
  return [
    { tile: C_START, count: ANIM_TILES, frames: animFrames, duration: ANIM_FRAME_MS },
    { tile: W_START, count: WATER_KINDS * W_KIND_STRIDE, frames: order.map((f) => W_START + f * W_FRAME_STRIDE), duration: WATER_FRAME_MS[water.speed] },
  ];
}
