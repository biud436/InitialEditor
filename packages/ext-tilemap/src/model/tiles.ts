// 타일 좌표와 gid 계산, 붓 도장, 칠하기 알고리즘. 전부 순수 함수다 (PIXI 도 DOM 도 모른다).

import type { MapData, Tileset } from "./format";

export interface TileSource {
  tilesetIndex: number;
  tileset: Tileset;
  /** 타일셋 안의 번호 (0 부터) */
  local: number;
  /** 타일셋 이미지 안의 픽셀 위치 */
  sx: number;
  sy: number;
}

/** gid 가 속한 타일셋. 0 이나 어느 타일셋에도 속하지 않으면 null (firstGid 가 가장 큰 것부터 본다) */
export function tileSource(tilesets: readonly Tileset[], gid: number, tileWidth: number, tileHeight: number): TileSource | null {
  if (gid <= 0) return null;
  let best = -1;
  for (let i = 0; i < tilesets.length; i++) {
    if (tilesets[i].firstGid <= gid && (best < 0 || tilesets[i].firstGid > tilesets[best].firstGid)) best = i;
  }
  if (best < 0) return null;
  const tileset = tilesets[best];
  const local = gid - tileset.firstGid;
  return {
    tilesetIndex: best,
    tileset,
    local,
    sx: (local % tileset.columns) * tileWidth,
    sy: Math.floor(local / tileset.columns) * tileHeight,
  };
}

/** 타일셋 안의 (열, 행) 을 gid 로 */
export function gidAt(tileset: Tileset, col: number, row: number): number {
  return tileset.firstGid + row * tileset.columns + col;
}

/** 이미지 크기로 타일셋 한 장의 타일 수 (다음 타일셋의 firstGid 를 정할 때) */
export function tileCount(tileset: Tileset, imageHeight: number, tileHeight: number): number {
  return tileset.columns * Math.floor(imageHeight / tileHeight);
}

export function cellIndex(map: Pick<MapData, "width">, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: Pick<MapData, "width" | "height">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** 붓: 팔레트에서 고른 직사각형 한 덩어리. gids[행][열], 0 은 "건드리지 않음" 이 아니라 "지움" */
export interface Brush {
  width: number;
  height: number;
  gids: number[][];
}

export function singleBrush(gid: number): Brush {
  return { width: 1, height: 1, gids: [[gid]] };
}

export const ERASER: Brush = singleBrush(0);

export interface CellChange {
  index: number;
  value: number;
}

/** 붓을 (x, y) 에 찍을 때 바뀌는 칸 (맵 밖은 버린다) */
export function stamp(map: Pick<MapData, "width" | "height">, brush: Brush, x: number, y: number): CellChange[] {
  const out: CellChange[] = [];
  for (let by = 0; by < brush.height; by++) {
    for (let bx = 0; bx < brush.width; bx++) {
      const tx = x + bx;
      const ty = y + by;
      if (inBounds(map, tx, ty)) out.push({ index: cellIndex(map, tx, ty), value: brush.gids[by][bx] });
    }
  }
  return out;
}

/** 두 점을 잇는 칸 (끌 때 빠른 마우스가 칸을 건너뛰지 않게). 브레젠험 */
export function lineCells(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** 사각형을 붓 무늬로 채운다 (무늬는 사각형의 왼쪽 위부터 되풀이) */
export function rectFill(map: Pick<MapData, "width" | "height">, brush: Brush, x0: number, y0: number, x1: number, y1: number): CellChange[] {
  const left = Math.max(0, Math.min(x0, x1));
  const right = Math.min(map.width - 1, Math.max(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const bottom = Math.min(map.height - 1, Math.max(y0, y1));
  const out: CellChange[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const bx = (x - left) % brush.width;
      const by = (y - top) % brush.height;
      out.push({ index: cellIndex(map, x, y), value: brush.gids[by][bx] });
    }
  }
  return out;
}

export interface FloodFillResult {
  changes: CellChange[];
  /** 한도에 닿아 이어진 칸을 다 채우지 못했다 */
  truncated: boolean;
  /** 이번 채우기의 한도 (칸 수) */
  limit: number;
}

/**
 * 같은 값으로 이어진 칸을 채운다 (네 방향). 무늬는 채울 영역의 격자에 맞춰 되풀이한다.
 * 시작 칸이 이미 그 값이고 붓이 한 칸이면 바뀌는 것이 없다.
 * 한도의 기본값은 맵의 칸 수라 맵 전체도 채운다. 한도에 닿으면 truncated로 알린다.
 */
export function floodFillArea(map: Pick<MapData, "width" | "height">, data: readonly number[], brush: Brush, x: number, y: number, limit = map.width * map.height): FloodFillResult {
  const out: CellChange[] = [];
  if (!inBounds(map, x, y)) return { changes: out, truncated: false, limit };
  const start = cellIndex(map, x, y);
  const target = data[start];
  if (brush.width === 1 && brush.height === 1 && brush.gids[0][0] === target) return { changes: out, truncated: false, limit };
  const cells = map.width * map.height;
  // 넣을 때 표시하므로 한 칸은 한 번만 쌓이고 스택은 칸 수를 넘지 않는다
  const seen = new Uint8Array(cells);
  const stack = new Int32Array(cells);
  let top = 0;
  const visit = (i: number) => {
    if (seen[i] || data[i] !== target) return;
    seen[i] = 1;
    stack[top++] = i;
  };
  visit(start);
  while (top > 0) {
    if (out.length >= limit) return { changes: out, truncated: true, limit };
    const i = stack[--top];
    const cx = i % map.width;
    const cy = (i - cx) / map.width;
    const bx = (((cx - x) % brush.width) + brush.width) % brush.width;
    const by = (((cy - y) % brush.height) + brush.height) % brush.height;
    out.push({ index: i, value: brush.gids[by][bx] });
    if (cx > 0) visit(i - 1);
    if (cx < map.width - 1) visit(i + 1);
    if (cy > 0) visit(i - map.width);
    if (cy < map.height - 1) visit(i + map.width);
  }
  return { changes: out, truncated: false, limit };
}

/** floodFillArea의 바뀌는 칸만 */
export function floodFill(map: Pick<MapData, "width" | "height">, data: readonly number[], brush: Brush, x: number, y: number, limit?: number): CellChange[] {
  return floodFillArea(map, data, brush, x, y, limit).changes;
}

/** 칸 범위에서 붓을 뜬다 (스포이드, 여러 칸) */
export function pickBrush(map: Pick<MapData, "width" | "height">, data: readonly number[], x0: number, y0: number, x1: number, y1: number): Brush {
  const left = Math.max(0, Math.min(x0, x1));
  const right = Math.min(map.width - 1, Math.max(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const bottom = Math.min(map.height - 1, Math.max(y0, y1));
  const gids: number[][] = [];
  for (let y = top; y <= bottom; y++) {
    const row: number[] = [];
    for (let x = left; x <= right; x++) row.push(data[cellIndex(map, x, y)]);
    gids.push(row);
  }
  return { width: right - left + 1, height: bottom - top + 1, gids };
}

/** 타일셋 팔레트에서 사각형으로 고른 붓 */
export function paletteBrush(tileset: Tileset, col0: number, row0: number, col1: number, row1: number): Brush {
  const left = Math.min(col0, col1);
  const right = Math.min(tileset.columns - 1, Math.max(col0, col1));
  const top = Math.min(row0, row1);
  const bottom = Math.max(row0, row1);
  const gids: number[][] = [];
  for (let r = top; r <= bottom; r++) {
    const row: number[] = [];
    for (let c = left; c <= right; c++) row.push(gidAt(tileset, c, r));
    gids.push(row);
  }
  return { width: right - left + 1, height: bottom - top + 1, gids };
}
