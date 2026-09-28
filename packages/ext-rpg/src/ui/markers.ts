// 이벤트 표식의 자리 (e5 문서 3절 "그리기"). 뷰가 그리고 도구가 맞히는 사각형이 같도록 한 곳에서 정한다.
//   외형이 있으면 CharSet 의 서 있는 프레임 (dir 이 있으면 그 방향 행, 없으면 정면). 가로는 칸 가운데, 발이 칸 아래 변
//   외형이 없으면 칸 크기의 표식과 트리거 글자 (결, 접, 자, 병)
// DOM 도 PIXI 도 모른다.

import { assetIndex, characterDrawPos, charsetFrame, resolveAssetFile, type Rect } from "../model/assets";
import { field, isNonNegInt, isPlainObject } from "../model/json";
import type { Area } from "../model/layer";
import type { Cell } from "../model/play";
import type { EventSchema } from "../model/schema";

export interface TriggerBadge {
  letter: string;
  /** 테마 토큰 */
  token: string;
  label: string;
}

export const TRIGGER_BADGES: Readonly<Record<string, TriggerBadge>> = {
  action: { letter: "결", token: "accent", label: "결정 키" },
  touch: { letter: "접", token: "warning", label: "플레이어 접촉" },
  auto: { letter: "자", token: "success", label: "자동 실행" },
  parallel: { letter: "병", token: "fg-muted", label: "병렬 처리" },
};

const UNKNOWN_BADGE: TriggerBadge = { letter: "?", token: "danger", label: "지원하지 않는 트리거" };

/** 트리거의 표식 (없으면 action, 모르는 값은 ?) */
export function triggerBadge(trigger: unknown): TriggerBadge {
  const t = trigger === undefined || trigger === null ? "action" : trigger;
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(TRIGGER_BADGES, t) ? TRIGGER_BADGES[t] : UNKNOWN_BADGE;
}

export interface EventMarker {
  /** 섹션 목록의 자리 */
  index: number;
  cell: Cell;
  /** 칸 사각형 (월드 픽셀) */
  cellRect: Rect;
  /** 그림이 차지하는 사각형. 외형이 있으면 프레임, 없으면 칸 */
  rect: Rect;
  badge: TriggerBadge;
  /** 외형 그림: 시트 파일(프로젝트 기준)과 그 안의 프레임. 외형이 없거나 스키마가 없으면 null */
  sprite: { sheet: string; frame: Rect } | null;
}

export interface MarkerContext {
  schema: EventSchema | null;
  tileWidth: number;
  tileHeight: number;
  /** 프로젝트 파일이 있는가. 모르면 null (후보의 마지막, 플레이스홀더로 푼다) */
  fileExists: ((projectPath: string) => boolean) | null;
}

/** 이벤트 칸 (x, y 가 0 이상의 정수가 아니면 null) */
export function eventCell(ev: unknown): Cell | null {
  const x = field(ev, "x");
  const y = field(ev, "y");
  return isNonNegInt(x) && isNonNegInt(y) ? { x, y } : null;
}

/** 표식 하나. 칸이 틀린 이벤트는 그리지 않는다 (null) */
export function eventMarker(ev: unknown, index: number, ctx: MarkerContext): EventMarker | null {
  if (!isPlainObject(ev)) return null;
  const cell = eventCell(ev);
  if (!cell) return null;
  const { tileWidth: tw, tileHeight: th, schema } = ctx;
  const cellRect = { x: cell.x * tw, y: cell.y * th, w: tw, h: th };
  const charset = field(ev, "charset");
  let sprite: EventMarker["sprite"] = null;
  let rect: Rect = cellRect;
  if (schema && charset !== undefined) {
    const sheet = resolveAssetFile(schema, "charset", charset, ctx.fileExists ?? (() => false));
    if (sheet) {
      const dir = field(ev, "dir");
      const frame = charsetFrame(schema, assetIndex(charset), typeof dir === "string" ? dir : undefined);
      const pos = characterDrawPos(schema, tw, th, cell.x, cell.y);
      sprite = { sheet, frame };
      rect = { x: pos.x, y: pos.y, w: frame.w, h: frame.h };
    }
  }
  return { index, cell, cellRect, rect, badge: triggerBadge(field(ev, "trigger")), sprite };
}

/** 그리는 순서의 표식: 외형 없는 표식이 먼저, 외형은 아래 줄일수록 앞 (게임처럼 y 순), 같으면 목록 순 */
export function eventMarkers(list: readonly unknown[], ctx: MarkerContext): EventMarker[] {
  const out: EventMarker[] = [];
  list.forEach((ev, i) => {
    const m = eventMarker(ev, i, ctx);
    if (m) out.push(m);
  });
  return out.sort((a, b) => Number(a.sprite !== null) - Number(b.sprite !== null) || (a.sprite && b.sprite ? a.cell.y - b.cell.y : 0) || a.index - b.index);
}

function contains(r: Rect, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

/**
 * 월드 점을 맞힌 이벤트. 그 칸에 선 이벤트가 먼저이고(나중 것이 위), 없으면 외형 그림이 덮는 칸 (앞에 그린 것이 위).
 * 없으면 null
 */
export function hitEvent(markers: readonly EventMarker[], world: { x: number; y: number }, cell: Cell): number | null {
  let byCell: number | null = null;
  for (const m of markers) if (m.cell.x === cell.x && m.cell.y === cell.y && (byCell === null || m.index > byCell)) byCell = m.index;
  if (byCell !== null) return byCell;
  for (let k = markers.length - 1; k >= 0; k--) if (markers[k].sprite && contains(markers[k].rect, world)) return markers[k].index;
  return null;
}

/** 이벤트의 배회 구역 (x, y, w, h 가 모두 맞는 수일 때만) */
export function wanderArea(ev: unknown): Area | null {
  const area = field(field(ev, "wander"), "area");
  const [x, y, w, h] = ["x", "y", "w", "h"].map((k) => field(area, k));
  if (!isNonNegInt(x) || !isNonNegInt(y) || typeof w !== "number" || typeof h !== "number" || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return null;
  return { x, y, w, h };
}

export type AreaEdge = "left" | "right" | "top" | "bottom";

/** 월드 점이 구역 사각형의 어느 가장자리 가까이에 있는가 (slack 은 월드 픽셀). 아니면 null */
export function areaEdgeAt(area: Area, tileWidth: number, tileHeight: number, world: { x: number; y: number }, slack: number): AreaEdge | null {
  const x0 = area.x * tileWidth;
  const y0 = area.y * tileHeight;
  const x1 = (area.x + area.w) * tileWidth;
  const y1 = (area.y + area.h) * tileHeight;
  const insideY = world.y >= y0 - slack && world.y <= y1 + slack;
  const insideX = world.x >= x0 - slack && world.x <= x1 + slack;
  if (insideY && Math.abs(world.x - x0) <= slack) return "left";
  if (insideY && Math.abs(world.x - x1) <= slack) return "right";
  if (insideX && Math.abs(world.y - y0) <= slack) return "top";
  if (insideX && Math.abs(world.y - y1) <= slack) return "bottom";
  return null;
}

/** 가장자리를 칸 cell 까지 끈 구역. 너비와 높이는 1 칸 아래로 줄지 않는다 */
export function dragAreaEdge(start: Area, edge: AreaEdge, cell: Cell): Area {
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  switch (edge) {
    case "left": {
      const x = Math.min(Math.max(0, cell.x), right - 1);
      return { ...start, x, w: right - x };
    }
    case "right":
      return { ...start, w: Math.max(1, cell.x + 1 - start.x) };
    case "top": {
      const y = Math.min(Math.max(0, cell.y), bottom - 1);
      return { ...start, y, h: bottom - y };
    }
    case "bottom":
      return { ...start, h: Math.max(1, cell.y + 1 - start.y) };
  }
}

/** 두 칸이 이루는 상자 안의 이벤트 */
export function eventsInBox(markers: readonly EventMarker[], a: Cell, b: Cell): number[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return markers
    .filter((m) => m.cell.x >= x0 && m.cell.x <= x1 && m.cell.y >= y0 && m.cell.y <= y1)
    .map((m) => m.index)
    .sort((p, q) => p - q);
}
