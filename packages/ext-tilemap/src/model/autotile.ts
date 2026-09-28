// 오토타일: Wang blob 47가지 모양을 6행 8열 시트(48칸)에 둔 타일셋. 전부 순수 함수다.
//
// 칸마다 여덟 이웃이 같은 지형인지를 비트로 모은 마스크(0..255)를 만들고, 모서리 비트는 닿은 두 변이 다
// 이어졌을 때만 남겨 47가지로 줄인 뒤, 배치 표에서 시트 칸 번호를 찾는다 (참고: cr31 Wang blob).
// 비트는 북쪽부터 시계 방향이다: N 1, NE 2, E 4, SE 8, S 16, SW 32, W 64, NW 128. y는 아래로 자란다.
//
// 칠하기 도구는 아직 없다. 엔진 로드맵 13단계("굽기": 에디터가 최종 gid를 정해 맵에 쓴다)와 함께 붙는다.

import type { Tileset } from "./format";

export const BLOB_COLUMNS = 8;
export const BLOB_ROWS = 6;
export const BLOB_CELLS = BLOB_COLUMNS * BLOB_ROWS;

export const BLOB_BITS = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

/** 방향마다 비트와 칸 오프셋 */
export const BLOB_NEIGHBORS: ReadonlyArray<{ bit: number; dx: number; dy: number }> = [
  { bit: BLOB_BITS.N, dx: 0, dy: -1 },
  { bit: BLOB_BITS.NE, dx: 1, dy: -1 },
  { bit: BLOB_BITS.E, dx: 1, dy: 0 },
  { bit: BLOB_BITS.SE, dx: 1, dy: 1 },
  { bit: BLOB_BITS.S, dx: 0, dy: 1 },
  { bit: BLOB_BITS.SW, dx: -1, dy: 1 },
  { bit: BLOB_BITS.W, dx: -1, dy: 0 },
  { bit: BLOB_BITS.NW, dx: -1, dy: -1 },
];

/** 시트 배치. rmCustom은 마지막 두 칸이 모두 외딴 칸(0), wang은 가운데 칸(255)이 두 번 나온다 */
export type BlobLayout = "rmCustom" | "wang";

// prettier-ignore
export const BLOB_LAYOUTS: Record<BlobLayout, readonly number[]> = {
  rmCustom: [
    255, 127, 253, 125, 247, 119, 245, 117,
    223, 95,  221, 93,  215, 87,  213, 85,
    31,  29,  23,  21,  124, 116, 92,  84,
    241, 209, 113, 81,  199, 71,  197, 69,
    17,  68,  28,  20,  112, 80,  193, 65,
    7,   5,   16,  4,   1,   64,  0,   0,
  ],
  wang: [
    20,  68,  92,  112, 28,  124, 116, 80,
    21,  84,  87,  221, 127, 255, 241, 17,
    29,  117, 85,  95,  247, 215, 209, 1,
    23,  213, 81,  31,  253, 125, 113, 16,
    5,   69,  93,  119, 223, 255, 245, 65,
    0,   4,   71,  193, 7,   199, 197, 64,
  ],
};

/** 모서리 비트는 닿은 두 변이 다 이어졌을 때만 남긴다. 256가지 마스크가 47가지가 된다 */
export function reduceBlobMask(mask: number): number {
  const { N, NE, E, SE, S, SW, W, NW } = BLOB_BITS;
  let m = mask & 0xff;
  if (!((m & N) && (m & E))) m &= ~NE;
  if (!((m & S) && (m & E))) m &= ~SE;
  if (!((m & S) && (m & W))) m &= ~SW;
  if (!((m & N) && (m & W))) m &= ~NW;
  return m;
}

/** 줄인 마스크 47가지 (오름차순) */
export const BLOB_MASKS: readonly number[] = [...new Set(Array.from({ length: 256 }, (_, m) => reduceBlobMask(m)))].sort((a, b) => a - b);

/** 이웃 마스크 (줄인 것). same(dx, dy)가 그 이웃이 같은 지형인지 알려 준다 */
export function neighborMask(same: (dx: number, dy: number) => boolean): number {
  let mask = 0;
  for (const n of BLOB_NEIGHBORS) if (same(n.dx, n.dy)) mask |= n.bit;
  return reduceBlobMask(mask);
}

/**
 * 행 우선 배열(맵 레이어)에서 (x, y) 칸의 마스크. isSame이 같은 지형의 값을 가린다.
 * 맵 밖 이웃은 outside로 본다 (기본: 이어진 것으로, 가장자리에 테두리가 생기지 않게).
 */
export function blobMaskAt(data: readonly number[], width: number, height: number, x: number, y: number, isSame: (value: number) => boolean, outside = true): number {
  return neighborMask((dx, dy) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return outside;
    return isSame(data[ny * width + nx]);
  });
}

/** 마스크의 시트 칸 번호 (0..47, 행 우선 8열). 마스크는 먼저 줄인다. 같은 마스크가 둘이면 앞 칸 */
export function blobTileIndex(mask: number, layout: BlobLayout = "rmCustom"): number {
  return BLOB_LAYOUTS[layout].indexOf(reduceBlobMask(mask));
}

/** 시트 칸 번호를 열과 행으로 */
export function blobTilePosition(index: number): { col: number; row: number } {
  return { col: index % BLOB_COLUMNS, row: Math.floor(index / BLOB_COLUMNS) };
}

/** 오토타일 시트 이미지의 크기 검사. 맞으면 null, 아니면 이유 */
export function blobSheetProblem(imageWidth: number, imageHeight: number, tileWidth: number, tileHeight: number): string | null {
  if (tileWidth <= 0 || tileHeight <= 0) return "타일 크기는 0보다 커야 함";
  const w = BLOB_COLUMNS * tileWidth;
  const h = BLOB_ROWS * tileHeight;
  if (imageWidth === w && imageHeight === h) return null;
  if (imageWidth <= imageHeight) return `6행 8열 시트는 너비가 높이보다 커야 함 (${imageWidth}x${imageHeight})`;
  return `이미지 크기는 ${w}x${h}여야 함 (6행 8열, 타일 ${tileWidth}x${tileHeight} 기준, 현재: ${imageWidth}x${imageHeight})`;
}

/** 타일셋 안 (origin.col, origin.row)부터 시트가 놓였을 때 마스크에 맞는 gid */
export function blobGid(tileset: Pick<Tileset, "firstGid" | "columns">, origin: { col: number; row: number }, mask: number, layout: BlobLayout = "rmCustom"): number {
  const p = blobTilePosition(blobTileIndex(mask, layout));
  return tileset.firstGid + (origin.row + p.row) * tileset.columns + origin.col + p.col;
}
