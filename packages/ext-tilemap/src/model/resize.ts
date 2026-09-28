// 맵 크기 바꾸기의 순수 계산. 기준점(아홉 곳)이 옛 칸이 새 맵의 어디에 놓일지 정한다.
// 칸 배열(레이어, 통행)은 겹치는 칸을 두고 새 칸을 0으로 채운다. 오브젝트는 픽셀로, RPG 이벤트는 칸으로 같은 만큼 옮긴다.

import type { MapObject } from "./format";
import { typeOf, type MapObjectSchema, type ObjectTypeSchema } from "./schema";

/** 한 변의 칸 수 한계 (새 맵과 크기 바꾸기) */
export const MAX_MAP_TILES = 1024;

export type ResizeAnchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";

/** 3x3 고르기의 순서 (행 우선) */
export const RESIZE_ANCHORS: readonly ResizeAnchor[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];

export const ANCHOR_LABELS: Record<ResizeAnchor, string> = {
  "top-left": "왼쪽 위",
  top: "위",
  "top-right": "오른쪽 위",
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
  "bottom-left": "왼쪽 아래",
  bottom: "아래",
  "bottom-right": "오른쪽 아래",
};

export interface GridSize {
  width: number;
  height: number;
}

/** 옛 칸 (x, y)가 새 맵의 (x + dx, y + dy)에 놓인다 */
export interface CellOffset {
  dx: number;
  dy: number;
}

/** 기준점의 가로와 세로 자리: 0은 왼쪽(위), 1은 가운데, 2는 오른쪽(아래) */
function anchorParts(anchor: ResizeAnchor): [number, number] {
  const i = RESIZE_ANCHORS.indexOf(anchor);
  if (i < 0) throw new Error(`모르는 기준점이다: ${String(anchor)}`);
  return [i % 3, Math.floor(i / 3)];
}

function align(part: number, diff: number): number {
  if (part === 0) return 0;
  if (part === 2) return diff;
  // 가운데는 0 쪽으로 버린다. 그래야 같은 기준점으로 늘렸다 줄이면 제자리다
  return Math.trunc(diff / 2) || 0;
}

export function anchorOffset(anchor: ResizeAnchor, from: GridSize, to: GridSize): CellOffset {
  const [h, v] = anchorParts(anchor);
  return { dx: align(h, to.width - from.width), dy: align(v, to.height - from.height) };
}

/** 폭과 높이 검사. 쓸 수 없으면 이유 */
export function validateMapSize(width: number, height: number): string | null {
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_MAP_TILES;
  if (!ok(width) || !ok(height)) return `폭과 높이는 1 이상 ${MAX_MAP_TILES} 이하의 정수다`;
  return null;
}

/** 칸 배열 하나를 새 크기로. 겹치는 칸은 옮겨 두고 새 칸은 fill로 채운다 */
export function resizeGrid(data: readonly number[], from: GridSize, to: GridSize, offset: CellOffset, fill = 0): number[] {
  const out = new Array<number>(to.width * to.height).fill(fill);
  for (let y = 0; y < to.height; y++) {
    const sy = y - offset.dy;
    if (sy < 0 || sy >= from.height) continue;
    for (let x = 0; x < to.width; x++) {
      const sx = x - offset.dx;
      if (sx < 0 || sx >= from.width) continue;
      out[y * to.width + x] = data[sy * from.width + sx];
    }
  }
  return out;
}

/** 스키마 칸 중 픽셀 x 좌표인 것 (순찰 범위의 rangeMin, rangeMax) */
export function xCoordinateProps(spec: ObjectTypeSchema | undefined): string[] {
  return (spec?.fields ?? []).filter((f) => f.role === "rangeMin" || f.role === "rangeMax").map((f) => f.name);
}

/** 띠는 맵 높이 전체라 세로 자리가 없다. 스키마가 없으면 폭만 있는 오브젝트를 띠로 본다 */
export function isBandObject(o: MapObject, spec: ObjectTypeSchema | undefined): boolean {
  if (spec) return spec.shape === "band";
  return o.width !== undefined && o.height === undefined;
}

/** (dx, dy) 픽셀 옮긴 사본. 띠는 y를 두고, 범위 칸은 x와 함께 옮긴다 */
export function shiftObject(o: MapObject, dx: number, dy: number, spec?: ObjectTypeSchema): MapObject {
  const props = { ...o.props };
  for (const name of xCoordinateProps(spec)) {
    const v = props[name];
    if (typeof v === "number" && Number.isFinite(v)) props[name] = v + dx;
  }
  return { ...o, x: o.x + dx, y: isBandObject(o, spec) ? o.y : o.y + dy, props, extra: { ...o.extra } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * RPG 이벤트의 칸 좌표(x, y)와 배회 구역(wander.area 의 x, y)을 옮긴 사본. 좌표가 숫자가 아닌 것은 그대로 둔다.
 * 이벤트 레이어가 붙은 맵의 크기 바꾸기도 이 함수로 옮긴다 (붙기 전과 뒤가 같은 결과라 되돌리기가 정확하다)
 */
export function shiftEvents(events: readonly unknown[], offset: CellOffset): unknown[] {
  return events.map((e) => {
    if (!isRecord(e) || typeof e.x !== "number" || typeof e.y !== "number") return e;
    const next: Record<string, unknown> = { ...e, x: e.x + offset.dx, y: e.y + offset.dy };
    const wander = e.wander;
    const area = isRecord(wander) ? wander.area : undefined;
    if (isRecord(wander) && isRecord(area) && typeof area.x === "number" && typeof area.y === "number") {
      next.wander = { ...wander, area: { ...area, x: area.x + offset.dx, y: area.y + offset.dy } };
    }
    return next;
  });
}

export interface ResizeSummary {
  offset: CellOffset;
  /** 칸이 잘려 나가는가 (한 변이라도 줄어든다) */
  clips: boolean;
  /** 새 맵 밖에 놓이는 오브젝트 id (자리 x, y가 밖) */
  objectsOutside: string[];
  /** 자리는 안인데 띠나 사각형의 끝, 순찰 범위가 새 맵 밖까지 가는 오브젝트 id */
  objectsPartlyOutside: string[];
  /** 새 맵 밖에 놓이는 이벤트 수 */
  eventsOutside: number;
}

export interface ResizeSource extends GridSize {
  tileWidth: number;
  tileHeight: number;
  objects: readonly MapObject[];
  events: readonly unknown[] | null;
}

/** 대화상자가 미리 보이는 결과 (고치지 않는다) */
export function resizeSummary(map: ResizeSource, to: GridSize, anchor: ResizeAnchor, schema: MapObjectSchema | null = null): ResizeSummary {
  const offset = anchorOffset(anchor, map, to);
  const pw = to.width * map.tileWidth;
  const ph = to.height * map.tileHeight;
  const objectsOutside: string[] = [];
  const objectsPartlyOutside: string[] = [];
  for (const o of map.objects) {
    const spec = typeOf(schema, o.type);
    const s = shiftObject(o, offset.dx * map.tileWidth, offset.dy * map.tileHeight, spec);
    const band = isBandObject(o, spec);
    const yOut = !band && (s.y < 0 || s.y >= ph);
    if (s.x < 0 || s.x >= pw || yOut) objectsOutside.push(o.id);
    else if (reachesOutside(s, spec, band, pw, ph)) objectsPartlyOutside.push(o.id);
  }
  let eventsOutside = 0;
  for (const e of shiftEvents(map.events ?? [], offset)) {
    if (!isRecord(e) || typeof e.x !== "number" || typeof e.y !== "number") continue;
    if (e.x < 0 || e.y < 0 || e.x >= to.width || e.y >= to.height) eventsOutside++;
  }
  return { offset, clips: to.width < map.width || to.height < map.height, objectsOutside, objectsPartlyOutside, eventsOutside };
}

/** 옮긴 오브젝트의 끝(띠와 사각형의 폭과 높이)이나 순찰 범위 칸이 새 맵 밖까지 가는가 */
function reachesOutside(s: MapObject, spec: ObjectTypeSchema | undefined, band: boolean, pw: number, ph: number): boolean {
  if (s.width !== undefined && s.x + s.width > pw) return true;
  if (!band && s.height !== undefined && s.y + s.height > ph) return true;
  return xCoordinateProps(spec).some((name) => {
    const v = s.props[name];
    return typeof v === "number" && Number.isFinite(v) && (v < 0 || v > pw);
  });
}
