// 맵 뷰의 좌표 계산 (순수 함수, DOM과 PIXI를 모른다. mapGeometry.test.ts가 검사한다).
//   - 화면과 월드 변환은 씬 뷰의 geometry.ts를 그대로 쓴다: world = (screen - pan) / zoom
//   - 칸과 덩어리(chunk) 번호, 붓질 선, 붓 무늬 도장
//   - 오브젝트 모양(점, 범위, 띠, 사각형)과 맞히기, 손잡이 끌기 계산
//   - 맵 안쪽만 긋는 타일 격자

import type { MapObject, ObjectTypeSchema } from "@initial-editor/ext-tilemap/model";
import { cellIndex, inBounds, lineCells, type Brush, type CellChange } from "@initial-editor/ext-tilemap/model";
import { screenToWorld, type Point, type Rect, type ViewTransform } from "../sceneView/geometry";

export { movedEnough, rectFromPoints, screenToWorld, worldToScreen, type Point, type Rect, type ViewTransform } from "../sceneView/geometry";

// ---- 줌 ----

/** 맵 뷰의 줌 범위. 씬 뷰(0.25)보다 더 작게 내려가야 긴 맵(4096px)이 한 화면에 든다 */
export const MAP_ZOOM_MIN = 0.1;
export const MAP_ZOOM_MAX = 8;
export const MAP_ZOOM_STEPS = [0.1, 0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, zoom));
}

export function nextZoomStep(zoom: number): number {
  return MAP_ZOOM_STEPS.find((z) => z > zoom + 1e-9) ?? MAP_ZOOM_MAX;
}

export function prevZoomStep(zoom: number): number {
  const below = MAP_ZOOM_STEPS.filter((z) => z < zoom - 1e-9);
  return below.length ? below[below.length - 1] : MAP_ZOOM_MIN;
}

/** 화면의 anchor 아래 월드 점이 새 줌에서도 제자리에 있도록 */
export function zoomAround(t: ViewTransform, newZoom: number, anchor: Point): ViewTransform {
  const zoom = clampZoom(newZoom);
  const world = screenToWorld(t, anchor);
  return { zoom, panX: anchor.x - world.x * zoom, panY: anchor.y - world.y * zoom };
}

/** 월드 사각형이 여백을 두고 가운데에 들어가는 변환 */
export function fitRect(viewport: { width: number; height: number }, rect: Rect, margin = 24): ViewTransform {
  const availW = Math.max(1, viewport.width - margin * 2);
  const availH = Math.max(1, viewport.height - margin * 2);
  const zoom = clampZoom(Math.min(availW / Math.max(1, rect.w), availH / Math.max(1, rect.h)));
  return { zoom, panX: (viewport.width - rect.w * zoom) / 2 - rect.x * zoom, panY: (viewport.height - rect.h * zoom) / 2 - rect.y * zoom };
}

export interface Cell {
  x: number;
  y: number;
}

interface MapSize {
  width: number;
  height: number;
}

// ---- 칸 ----

/** 월드 점이 놓인 칸 (맵 밖이어도 돌려준다) */
export function cellAt(p: Point, tileW: number, tileH: number): Cell {
  return { x: Math.floor(p.x / tileW), y: Math.floor(p.y / tileH) };
}

export function sameCell(a: Cell | null, b: Cell | null): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

/** 두 칸을 잇는 정규화된 칸 범위 (양 끝 포함) */
export function cellRange(a: Cell, b: Cell): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** 칸 범위를 맵 안으로 자른다. 겹치는 곳이 없으면 null */
export function clampRange(r: { x0: number; y0: number; x1: number; y1: number }, map: MapSize): { x0: number; y0: number; x1: number; y1: number } | null {
  const out = { x0: Math.max(0, r.x0), y0: Math.max(0, r.y0), x1: Math.min(map.width - 1, r.x1), y1: Math.min(map.height - 1, r.y1) };
  return out.x0 > out.x1 || out.y0 > out.y1 ? null : out;
}

// ---- 덩어리 ----

/** 덩어리 한 변의 칸 수. 칸 하나를 고치면 그 칸이 든 덩어리 하나만 다시 그린다 */
export const CHUNK_TILES = 32;

export interface ChunkGrid {
  cols: number;
  rows: number;
  size: number;
}

export function chunkGrid(map: MapSize, size = CHUNK_TILES): ChunkGrid {
  return { cols: Math.ceil(map.width / size), rows: Math.ceil(map.height / size), size };
}

/** 칸 번호(행 우선)가 든 덩어리 번호 (행 우선) */
export function chunkOfIndex(index: number, mapWidth: number, grid: ChunkGrid): number {
  const x = index % mapWidth;
  const y = Math.floor(index / mapWidth);
  return Math.floor(y / grid.size) * grid.cols + Math.floor(x / grid.size);
}

/** 덩어리가 덮는 칸 범위 (맵 끝에서 잘린다) */
export function chunkCells(chunk: number, map: MapSize, grid: ChunkGrid): { x0: number; y0: number; w: number; h: number } {
  const cx = chunk % grid.cols;
  const cy = Math.floor(chunk / grid.cols);
  const x0 = cx * grid.size;
  const y0 = cy * grid.size;
  return { x0, y0, w: Math.min(grid.size, map.width - x0), h: Math.min(grid.size, map.height - y0) };
}

/** 바뀐 칸 번호들을 덩어리별로 묶는다 */
export function groupByChunk(indices: Iterable<number>, mapWidth: number, grid: ChunkGrid): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const i of indices) {
    const c = chunkOfIndex(i, mapWidth, grid);
    let list = out.get(c);
    if (!list) out.set(c, (list = []));
    list.push(i);
  }
  return out;
}

// ---- 붓질 ----

/** 끌기 중 새 칸까지 찍을 칸들. 처음이면 그 칸 하나, 아니면 지난 칸 다음부터 새 칸까지 (브레젠험) */
export function strokeSegment(last: Cell | null, next: Cell): Cell[] {
  if (!last) return [next];
  if (sameCell(last, next)) return [];
  return lineCells(last.x, last.y, next.x, next.y)
    .slice(1)
    .map(([x, y]) => ({ x, y }));
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * 붓질의 도장. 붓을 at에 찍되 값은 붓질 시작 칸(origin)에 맞춘 무늬에서 고른다.
 * 여러 칸짜리 붓으로 끌어도 겹친 칸의 값이 어긋나지 않는다.
 */
export function patternStamp(map: MapSize, brush: Brush, origin: Cell, at: Cell): CellChange[] {
  const out: CellChange[] = [];
  for (let by = 0; by < brush.height; by++) {
    for (let bx = 0; bx < brush.width; bx++) {
      const x = at.x + bx;
      const y = at.y + by;
      if (!inBounds(map, x, y)) continue;
      out.push({ index: cellIndex(map, x, y), value: brush.gids[mod(y - origin.y, brush.height)][mod(x - origin.x, brush.width)] });
    }
  }
  return out;
}

/** 여러 칸에 도장을 찍은 변경. 같은 칸은 마지막 값 하나로 */
export function strokeChanges(map: MapSize, brush: Brush, origin: Cell, cells: readonly Cell[]): CellChange[] {
  const byIndex = new Map<number, number>();
  for (const c of cells) for (const ch of patternStamp(map, brush, origin, c)) byIndex.set(ch.index, ch.value);
  return [...byIndex].map(([index, value]) => ({ index, value }));
}

/** 값이 실제로 바뀌는 것만 남긴다 (배열이 없으면 0으로 본다) */
export function onlyChanged(data: readonly number[] | null, changes: readonly CellChange[]): CellChange[] {
  return changes.filter((c) => (data ? data[c.index] ?? 0 : 0) !== c.value);
}

// ---- 팔레트 ----

export interface PaletteCell {
  col: number;
  row: number;
}

/**
 * 붓이 타일셋 팔레트의 어디인지. 팔레트에서 뜬 사각형 그대로면 rect 하나, 아니면 이 타일셋에 든 칸들(cells).
 * rows는 이미지의 행 수 (이미지 밖의 gid는 빠진다).
 */
export function brushInTileset(
  brush: Brush,
  tileset: { firstGid: number; columns: number },
  rows: number,
): { rect: { col: number; row: number; width: number; height: number } | null; cells: PaletteCell[] } {
  const total = tileset.columns * rows;
  const cellOf = (gid: number): PaletteCell | null => {
    const local = gid - tileset.firstGid;
    if (gid <= 0 || local < 0 || local >= total) return null;
    return { col: local % tileset.columns, row: Math.floor(local / tileset.columns) };
  };
  const seen = new Set<number>();
  const cells: PaletteCell[] = [];
  for (const row of brush.gids) {
    for (const gid of row) {
      const c = cellOf(gid);
      if (!c || seen.has(gid)) continue;
      seen.add(gid);
      cells.push(c);
    }
  }
  const origin = cellOf(brush.gids[0]?.[0] ?? 0);
  if (origin && origin.col + brush.width <= tileset.columns) {
    let exact = true;
    for (let y = 0; y < brush.height && exact; y++) {
      for (let x = 0; x < brush.width; x++) {
        if (brush.gids[y][x] !== tileset.firstGid + (origin.row + y) * tileset.columns + origin.col + x) {
          exact = false;
          break;
        }
      }
    }
    if (exact && origin.row + brush.height <= rows) return { rect: { col: origin.col, row: origin.row, width: brush.width, height: brush.height }, cells };
  }
  return { rect: null, cells };
}

// ---- 오브젝트 모양 ----

export interface RangeInfo {
  min: number;
  max: number;
  minField: string;
  maxField: string;
}

export type ObjectShape =
  | { kind: "point"; id: string; x: number; y: number; range: RangeInfo | null }
  | { kind: "band"; id: string; x: number; width: number }
  | { kind: "rect"; id: string; x: number; y: number; width: number; height: number };

export const DEFAULT_BAND_WIDTH = 16;

/** 스키마의 모양을 따른다. 스키마에 없는 타입은 폭과 높이가 있으면 사각형, 폭만 있으면 띠, 없으면 점 */
export function shapeOf(o: MapObject, spec: ObjectTypeSchema | undefined): ObjectShape {
  const kind = spec?.shape ?? (o.width !== undefined && o.height !== undefined ? "rect" : o.width !== undefined ? "band" : "point");
  if (kind === "band") return { kind, id: o.id, x: o.x, width: Math.max(1, o.width ?? spec?.defaultWidth ?? DEFAULT_BAND_WIDTH) };
  if (kind === "rect") {
    return { kind, id: o.id, x: o.x, y: o.y, width: Math.max(1, o.width ?? spec?.defaultWidth ?? DEFAULT_BAND_WIDTH), height: Math.max(1, o.height ?? spec?.defaultHeight ?? DEFAULT_BAND_WIDTH) };
  }
  let range: RangeInfo | null = null;
  const lo = spec?.fields.find((f) => f.role === "rangeMin");
  const hi = spec?.fields.find((f) => f.role === "rangeMax");
  if (lo && hi) {
    const a = o.props[lo.name];
    const b = o.props[hi.name];
    if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) range = { min: a, max: b, minField: lo.name, maxField: hi.name };
  }
  return { kind: "point", id: o.id, x: o.x, y: o.y, range };
}

/** 모양의 경계 상자 (띠는 맵 높이 전체) */
export function shapeBounds(s: ObjectShape, mapPixelHeight: number): Rect {
  switch (s.kind) {
    case "point": {
      if (!s.range) return { x: s.x, y: s.y, w: 0, h: 0 };
      const left = Math.min(s.x, s.range.min);
      const right = Math.max(s.x, s.range.max);
      return { x: left, y: s.y, w: right - left, h: 0 };
    }
    case "band":
      return { x: s.x, y: 0, w: s.width, h: mapPixelHeight };
    case "rect":
      return { x: s.x, y: s.y, w: s.width, h: s.height };
  }
}

/** 점 표식의 반지름 (화면 픽셀) */
export const POINT_RADIUS_PX = 6;
/** 범위 손잡이(세로 막대)의 반 높이와 반 폭 (화면 픽셀) */
export const RANGE_HANDLE_HALF_H_PX = 8;
export const RANGE_HANDLE_HALF_W_PX = 2;
/** 맞히기 여유 (화면 픽셀) */
export const HIT_TOLERANCE_PX = 4;

export type ObjectPart = "body" | "rangeMin" | "rangeMax" | "bandLeft" | "bandRight";

export interface ObjectHit {
  id: string;
  part: ObjectPart;
}

/**
 * 점 아래의 오브젝트. 점 표식, 범위 손잡이, 점 표식의 여유가 먼저다 (같은 종류에서는 목록의 뒤, 위에 그려진 것이 먼저).
 * 그다음은 띠와 사각형이다. 점이 든 가장 작은 모양(띠는 맵 높이 전체의 넓이로 잰다)을 고르되, 그보다 크지 않은
 * 띠의 가장자리가 닿으면 가장자리가 먼저다. 가장자리가 여럿 닿으면 가까운 것, 같은 거리면 점이 안에 든 띠의 것,
 * 그다음 좁은 띠의 것이다 (맞닿은 두 띠는 누른 쪽 띠의 가장자리).
 * zoom은 화면 픽셀 여유를 월드로 바꾸는 데 쓴다.
 */
export function hitObject(shapes: readonly ObjectShape[], p: Point, zoom: number, mapPixelHeight: number): ObjectHit | null {
  const tol = HIT_TOLERANCE_PX / zoom;
  const radius = POINT_RADIUS_PX / zoom;
  const handleW = RANGE_HANDLE_HALF_W_PX / zoom + tol;
  const handleH = RANGE_HANDLE_HALF_H_PX / zoom + tol;
  const inHeight = p.y >= -tol && p.y <= mapPixelHeight + tol;
  const pointPasses: Array<(s: ObjectShape) => ObjectPart | null> = [
    (s) => (s.kind === "point" && Math.hypot(p.x - s.x, p.y - s.y) <= radius ? "body" : null),
    (s) => {
      if (s.kind !== "point" || !s.range || Math.abs(p.y - s.y) > handleH) return null;
      const nearMin = Math.abs(p.x - s.range.min) <= handleW;
      const nearMax = Math.abs(p.x - s.range.max) <= handleW;
      // 두 손잡이가 겹치면 (min == max) 누른 쪽으로 넓힐 수 있게 가른다
      if (nearMin && nearMax) return p.x >= s.range.max ? "rangeMax" : "rangeMin";
      return nearMin ? "rangeMin" : nearMax ? "rangeMax" : null;
    },
    (s) => (s.kind === "point" && Math.hypot(p.x - s.x, p.y - s.y) <= radius + tol ? "body" : null),
  ];
  for (const pass of pointPasses) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const part = pass(shapes[i]);
      if (part) return { id: shapes[i].id, part };
    }
  }
  // 띠와 사각형: 가장 작은 몸통을 고르고, 그보다 크지 않은 띠의 가장자리가 닿으면 그 가장자리
  const edges: Array<{ hit: ObjectHit; size: number; dist: number; inside: boolean }> = [];
  let body: { hit: ObjectHit; size: number } | null = null;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.kind === "band") {
      if (!inHeight) continue;
      const size = s.width * mapPixelHeight;
      const inside = p.x >= s.x && p.x <= s.x + s.width;
      const right = Math.abs(p.x - (s.x + s.width));
      const left = Math.abs(p.x - s.x);
      if (right <= tol) edges.push({ hit: { id: s.id, part: "bandRight" }, size, dist: right, inside });
      if (left <= tol) edges.push({ hit: { id: s.id, part: "bandLeft" }, size, dist: left, inside });
      if (inside && (!body || size < body.size)) body = { hit: { id: s.id, part: "body" }, size };
    } else if (s.kind === "rect") {
      if (p.x < s.x - tol || p.x > s.x + s.width + tol || p.y < s.y - tol || p.y > s.y + s.height + tol) continue;
      const size = s.width * s.height;
      if (!body || size < body.size) body = { hit: { id: s.id, part: "body" }, size };
    }
  }
  let edge: (typeof edges)[number] | null = null;
  for (const e of edges) {
    if (body && e.size > body.size) continue;
    const better = !edge || e.dist < edge.dist || (e.dist === edge.dist && ((e.inside && !edge.inside) || (e.inside === edge.inside && e.size < edge.size)));
    if (better) edge = e;
  }
  return edge?.hit ?? body?.hit ?? null;
}

/** 큰 띠의 기준 폭 (칸). 이보다 넓거나 다른 오브젝트를 품은 띠는 먼저 골라야 몸통을 끌어 옮긴다 */
export const LARGE_BAND_TILES = 16;

/**
 * 큰 띠인가: 폭이 LARGE_BAND_TILES 칸 이상이거나 다른 오브젝트의 x 를 품는다 (구간 같은 배경 띠).
 * 큰 띠의 몸통은 고르지 않은 채로 끌면 상자 선택이 된다. 줌과 무관하다.
 */
export function isLargeBand(s: ObjectShape, shapes: readonly ObjectShape[], tileWidth: number): boolean {
  if (s.kind !== "band") return false;
  if (s.width >= LARGE_BAND_TILES * tileWidth) return true;
  return shapes.some((o) => o.id !== s.id && o.kind !== "band" && o.x >= s.x && o.x < s.x + s.width);
}

/** 상자 선택: 점은 상자 안에 있어야 하고, 띠는 가로로 다 들어야 하고, 사각형은 겹치면 든다 */
export function shapesInRect(shapes: readonly ObjectShape[], r: Rect, mapPixelHeight: number): string[] {
  const out: string[] = [];
  for (const s of shapes) {
    if (s.kind === "point") {
      if (s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h) out.push(s.id);
      continue;
    }
    const b = shapeBounds(s, mapPixelHeight);
    const overlapsY = b.y <= r.y + r.h && r.y <= b.y + b.h;
    const inX = s.kind === "band" ? b.x >= r.x && b.x + b.w <= r.x + r.w : b.x <= r.x + r.w && r.x <= b.x + b.w;
    if (inX && overlapsY) out.push(s.id);
  }
  return out;
}

// ---- 끌기 ----

/** 범위 손잡이를 x로 끌었을 때 고칠 칸과 값. 왼끝은 0..max, 오른끝은 min..맵 폭으로 자른다 */
export function rangeDragValue(range: RangeInfo, part: "rangeMin" | "rangeMax", worldX: number, mapPixelWidth: number): { field: string; value: number } {
  const x = Math.round(worldX);
  if (part === "rangeMin") return { field: range.minField, value: Math.max(0, Math.min(range.max, x)) };
  return { field: range.maxField, value: Math.min(mapPixelWidth, Math.max(range.min, x)) };
}

/** 띠의 가장자리를 끌었을 때의 x와 폭. 반대쪽 가장자리는 제자리이고 폭은 1 이상이다 */
export function bandEdgeDrag(start: { x: number; width: number }, part: "bandLeft" | "bandRight", worldX: number): { x: number; width: number } {
  const x = Math.round(worldX);
  if (part === "bandRight") return { x: start.x, width: Math.max(1, x - start.x) };
  const right = start.x + start.width;
  const left = Math.min(x, right - 1);
  return { x: left, width: right - left };
}

export interface MoveStart {
  id: string;
  x: number;
  y: number;
  /** 띠는 세로로 옮기지 않는다 */
  lockY: boolean;
  /** 순찰 범위가 있는 점은 범위도 같이 옮긴다 */
  range?: RangeInfo | null;
}

export interface MoveTarget {
  id: string;
  x: number;
  y: number;
  /** 옮긴 범위 (범위가 있는 점만) */
  range?: RangeInfo;
}

/**
 * 끌기 변위를 정수 픽셀로 반올림해 적용한다. 범위는 폭을 지킨 채 같은 만큼 옮기되 맵 폭 안에서 멈춘다.
 * keepRange면 범위는 제자리다 (몸통만 옮긴다).
 */
export function moveTargets(starts: readonly MoveStart[], dx: number, dy: number, mapPixelWidth = Infinity, keepRange = false): MoveTarget[] {
  const rx = Math.round(dx);
  const ry = Math.round(dy);
  return starts.map((s) => {
    const out: MoveTarget = { id: s.id, x: s.x + rx, y: s.lockY ? s.y : s.y + ry };
    if (s.range) {
      const lo = Math.min(0, -s.range.min);
      const hi = Math.max(0, mapPixelWidth - s.range.max);
      const shift = keepRange ? 0 : Math.min(hi, Math.max(lo, rx));
      out.range = { ...s.range, min: s.range.min + shift, max: s.range.max + shift };
    }
    return out;
  });
}

/** 방향키 이동: 1px, Shift는 타일 한 칸 */
export function nudgeStep(key: string, shift: boolean, tileW: number, tileH: number): Point | null {
  const sx = shift ? tileW : 1;
  const sy = shift ? tileH : 1;
  switch (key) {
    case "ArrowLeft":
      return { x: -sx, y: 0 };
    case "ArrowRight":
      return { x: sx, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -sy };
    case "ArrowDown":
      return { x: 0, y: sy };
    default:
      return null;
  }
}

// ---- 격자와 처음 보기 ----

export interface TileGridLines {
  minor: { xs: number[]; ys: number[] };
  major: { xs: number[]; ys: number[] };
  /** 선을 그을 월드 범위 (맵과 뷰포트가 겹치는 곳) */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * 타일 경계 격자. 맵 안쪽과 뷰포트가 겹치는 곳만 긋는다. majorEvery 칸마다 굵은 선이고,
 * 화면에서 minSpacingPx보다 촘촘하면 가는 선을 뺀다.
 */
export function tileGridLines(
  t: ViewTransform,
  viewport: { width: number; height: number },
  tileW: number,
  tileH: number,
  map: MapSize,
  majorEvery = 8,
  minSpacingPx = 6,
): TileGridLines | null {
  const tl = screenToWorld(t, { x: 0, y: 0 });
  const br = screenToWorld(t, { x: viewport.width, y: viewport.height });
  const mapW = map.width * tileW;
  const mapH = map.height * tileH;
  const left = Math.max(0, tl.x);
  const right = Math.min(mapW, br.x);
  const top = Math.max(0, tl.y);
  const bottom = Math.min(mapH, br.y);
  if (left >= right || top >= bottom) return null;
  const minor = { xs: [] as number[], ys: [] as number[] };
  const major = { xs: [] as number[], ys: [] as number[] };
  const drawMinorX = tileW * t.zoom >= minSpacingPx;
  const drawMinorY = tileH * t.zoom >= minSpacingPx;
  const drawMajorX = tileW * majorEvery * t.zoom >= minSpacingPx;
  const drawMajorY = tileH * majorEvery * t.zoom >= minSpacingPx;
  for (let cx = Math.ceil(left / tileW); cx * tileW <= right; cx++) {
    const isMajor = cx % majorEvery === 0;
    if (isMajor && drawMajorX) major.xs.push(cx * tileW);
    else if (!isMajor && drawMinorX) minor.xs.push(cx * tileW);
  }
  for (let cy = Math.ceil(top / tileH); cy * tileH <= bottom; cy++) {
    const isMajor = cy % majorEvery === 0;
    if (isMajor && drawMajorY) major.ys.push(cy * tileH);
    else if (!isMajor && drawMinorY) minor.ys.push(cy * tileH);
  }
  return { minor, major, top, bottom, left, right };
}

/**
 * 맵을 처음 열 때의 보기. 여백 안에 다 들어가면 들어가는 가장 큰 정수 배율(4까지)로 가운데에,
 * 안 들어가면 100%로 왼쪽 위에 둔다.
 */
export function initialView(viewport: { width: number; height: number }, mapPixelW: number, mapPixelH: number, margin = 24): ViewTransform {
  const availW = viewport.width - margin * 2;
  const availH = viewport.height - margin * 2;
  let zoom = 1;
  for (let z = 4; z >= 1; z--) {
    if (mapPixelW * z <= availW && mapPixelH * z <= availH) {
      zoom = z;
      break;
    }
  }
  const fits = mapPixelW * zoom <= availW && mapPixelH * zoom <= availH;
  if (!fits) return { zoom: 1, panX: margin, panY: margin };
  return { zoom, panX: Math.round((viewport.width - mapPixelW * zoom) / 2), panY: Math.round((viewport.height - mapPixelH * zoom) / 2) };
}

/** 화면 가운데에 월드 점이 오게 하는 변환 */
export function centerOn(t: ViewTransform, viewport: { width: number; height: number }, world: Point): ViewTransform {
  const zoom = clampZoom(t.zoom);
  return { zoom, panX: Math.round(viewport.width / 2 - world.x * zoom), panY: Math.round(viewport.height / 2 - world.y * zoom) };
}
