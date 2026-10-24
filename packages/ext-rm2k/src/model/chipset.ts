// RPG Maker 2000 ChipSet 그림의 배치. 480x256 픽셀, 16x16 타일 30열 16행이다.
// 근거는 EasyRPG Player 의 src/tilemap_layer.cpp 와 EasyRPG Editor 의 src/core.cpp 다 (docs/plans/rm2k-tilemap.md 2절).
//
//   (0, 0)    물 A1 물가     48x64. 세로 줄 셋이 애니메이션 프레임이고, 줄마다 물가 타일 넷 (아래 SHORE_ROW)
//   (48, 0)   물 A2 물가     같은 구조. 깊은 물은 A1 의 물가를 쓴다
//   (0, 64)   물 몸통        세로 줄 셋이 프레임. 줄 넷은 얕은 물, 깊은 모서리가 든 얕은 물, 얕은 모서리가 든 깊은 물, 깊은 물
//   (48, 64)  애니메이션 타일 셋 (C1, C2, C3). 타일마다 세로로 프레임 넷
//   D1..D12   땅 오토타일 열둘. 48x64 덩어리 (3x4 타일)
//   E         하층 타일 144개. (192, 0) 의 6열 16행에 0..95, (288, 0) 의 6열 8행에 96..143
//   F         상층 타일 144개. (288, 128) 의 6열 8행에 0..47, (384, 0) 의 6열 16행에 48..143

export const CHIPSET_WIDTH = 480;
export const CHIPSET_HEIGHT = 256;
export const TILE = 16;
export const HALF = 8;

/** 물의 종류: 0 은 물 A1, 1 은 물 A2, 2 는 깊은 물 */
export type WaterKind = 0 | 1 | 2;
export const WATER_KINDS = 3;
export const WATER_FRAMES = 3;
export const ANIM_TILES = 3;
export const ANIM_FRAMES = 4;
export const D_KINDS = 12;
export const E_TILES = 144;
export const F_TILES = 144;

/** 투명색을 정하는 픽셀 (F0 의 왼쪽 위). 팔레트 그림이 아니고 알파도 없을 때 이 색을 투명으로 본다 */
export const KEY_PIXEL = { x: 288, y: 128 } as const;

export interface PixelPoint {
  x: number;
  y: number;
}

/** 물가 세로 줄(16x64)의 왼쪽 x. 줄 안의 타일은 SHORE_ROW 순서다 */
export function shoreX(kind: WaterKind, frame: number): number {
  return (kind === 1 ? 48 : 0) + frame * TILE;
}

/** 물가 세로 줄 안의 타일: 0 바깥 모서리, 1 세로 물가(서, 동), 2 가로 물가(북, 남), 3 안쪽 모서리 */
export type ShoreRow = 0 | 1 | 2 | 3;

/** 물 몸통 줄: 0 얕은 물, 1 깊은 모서리가 든 얕은 물, 2 얕은 모서리가 든 깊은 물, 3 깊은 물 */
export type BodyRow = 0 | 1 | 2 | 3;

export function bodyOrigin(row: BodyRow, frame: number): PixelPoint {
  return { x: frame * TILE, y: 64 + row * TILE };
}

/** 애니메이션 타일 n(0..2)의 프레임 frame(0..3) */
export function animOrigin(n: number, frame: number): PixelPoint {
  return { x: 48 + n * TILE, y: 64 + frame * TILE };
}

/** 땅 오토타일 n(0..11, D1..D12)의 48x64 덩어리 왼쪽 위 */
export function dOrigin(n: number): PixelPoint {
  if (n < 4) return { x: (n % 2) * 48, y: 128 + Math.floor(n / 2) * 64 };
  return { x: 96 + ((n - 4) % 2) * 48, y: Math.floor((n - 4) / 2) * 64 };
}

/** 하층 타일 id(0..143) */
export function eOrigin(id: number): PixelPoint {
  if (id < 96) return { x: (12 + (id % 6)) * TILE, y: Math.floor(id / 6) * TILE };
  return { x: (18 + ((id - 96) % 6)) * TILE, y: Math.floor((id - 96) / 6) * TILE };
}

/** 상층 타일 id(0..143) */
export function fOrigin(id: number): PixelPoint {
  if (id < 48) return { x: (18 + (id % 6)) * TILE, y: (8 + Math.floor(id / 6)) * TILE };
  return { x: (24 + ((id - 48) % 6)) * TILE, y: Math.floor((id - 48) / 6) * TILE };
}
