// 이벤트 도구 (e5 문서 3절). 대상이 이벤트 레이어일 때 맵 뷰의 포인터와 키를 받는다 (앱이 넘긴다).
//   클릭           고르기. Shift 나 Ctrl 은 더하고 빼기. 빈 곳 끌기는 상자 선택
//   끌기           칸 단위로 옮기기. 놓을 때 명령 하나라 되돌리기 한 단계다. 놓을 수 없는 칸이면 미리보기가 danger 이고
//                  놓아도 제자리. 배회 구역도 같은 만큼 옮기고, Alt 를 누르면 구역은 둔다
//   구역 가장자리   고른 이벤트의 배회 구역 크기 (한 단계)
//   빈 칸 더블클릭  새 이벤트 (인스펙터의 id 칸에 초점). 이벤트를 더블클릭하면 커맨드 편집기로 초점
//   방향키         한 칸 옮기기 (Alt 는 구역을 둔다)
//   Delete         지우기
//   Ctrl+C, V, D   복사, 붙여넣기(커서 칸), 복제. 확장의 클립보드이고 처리하면 앱이 전파를 막아 전역 edit.* 에 닿지 않는다
//   Ctrl+A         모두 고르기
//   Enter          커맨드 편집기의 첫 줄로 초점
//   Escape         끌기 취소, 고르기 풀기
// 잠긴 레이어는 고르기와 복사만 되고, 편집 동작은 이유를 알리며 거절한다. DOM 을 모른다.

import type { MapLayerKey, MapLayerPointer, MapLayerTool, MapLayerToolContext } from "@initial-editor/ext-tilemap";
import { isPlainObject } from "../model/json";
import { eventsStateOf, type Area, type EventsLayerState } from "../model/layer";
import type { Cell } from "../model/play";
import type { EventClipboard } from "./eventClipboard";
import { areaEdgeAt, dragAreaEdge, eventCell, eventMarkers, eventsInBox, hitEvent, wanderArea, type AreaEdge, type EventMarker } from "./markers";

type Gesture =
  | { kind: "press"; start: Cell; indices: number[]; moved: boolean; warned: boolean; dx: number; dy: number; ok: boolean; keepArea: boolean }
  | { kind: "box"; from: Cell; to: Cell; additive: boolean; base: number[] }
  | { kind: "area"; index: number; edge: AreaEdge; start: Area; area: Area; ok: boolean; warned: boolean };

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** 구역 가장자리를 잡는 너비 (화면 픽셀) */
const EDGE_SLACK_PX = 5;
/** 복제가 찾는 자리: 오른쪽, 아래, 왼쪽, 위, 그다음 대각선과 두 칸 */
const DUPLICATE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [2, 0],
  [0, 2],
  [-2, 0],
  [0, -2],
];

function sameArea(a: Area, b: Area): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export class EventsTool implements MapLayerTool {
  private gesture: Gesture | null = null;
  /** 마지막으로 포인터가 있던 칸 (붙여넣기 자리). 뷰를 떠나도 남는다 */
  private hover: Cell | null = null;
  private hoverKind: "event" | AreaEdge | null = null;

  constructor(
    private readonly ctx: MapLayerToolContext,
    private readonly clipboard: EventClipboard,
  ) {}

  private get state(): EventsLayerState | null {
    return eventsStateOf(this.ctx.document);
  }

  private markers(st: EventsLayerState): EventMarker[] {
    const m = this.ctx.document.model;
    return eventMarkers(st.section.list, { schema: st.schema, tileWidth: m.tileWidth, tileHeight: m.tileHeight, fileExists: null });
  }

  /** 고른 이벤트 하나의 배회 구역 가장자리 */
  private edgeAt(st: EventsLayerState, world: { x: number; y: number }): { index: number; edge: AreaEdge; area: Area } | null {
    const index = st.primary;
    if (index === null) return null;
    const area = wanderArea(st.section.list[index]);
    if (!area) return null;
    const m = this.ctx.document.model;
    const edge = areaEdgeAt(area, m.tileWidth, m.tileHeight, world, EDGE_SLACK_PX / Math.max(0.01, this.ctx.zoom()));
    return edge ? { index, edge, area } : null;
  }

  /** 칸에 선 이벤트 (나중 것이 위) */
  private cellHit(markers: readonly EventMarker[], cell: Cell): number | null {
    let hit: number | null = null;
    for (const m of markers) if (m.cell.x === cell.x && m.cell.y === cell.y && (hit === null || m.index > hit)) hit = m.index;
    return hit;
  }

  /** 끄는 중이던 것을 버린다 (미리보기도 지운다) */
  private cancelGesture(st: EventsLayerState | null): boolean {
    const had = this.gesture !== null;
    this.gesture = null;
    if (st?.drag) st.setDrag(null);
    return had;
  }

  private notice(message: string): void {
    this.ctx.notice(message);
  }

  // ---- 포인터 ----

  pointerDown(p: MapLayerPointer): void {
    this.hover = p.cell;
    const st = this.state;
    this.cancelGesture(st);
    if (!st || p.button !== 0) return;
    const markers = this.markers(st);
    let hit = this.cellHit(markers, p.cell);
    if (hit === null) {
      const edge = this.edgeAt(st, p.world);
      if (edge) {
        this.gesture = { kind: "area", index: edge.index, edge: edge.edge, start: edge.area, area: edge.area, ok: true, warned: false };
        this.ctx.changed();
        return;
      }
      hit = hitEvent(markers, p.world, p.cell);
    }
    if (hit !== null) {
      if (p.shift || p.mod) st.toggle(hit);
      else {
        if (!st.selected.includes(hit)) st.select([hit]);
        this.gesture = { kind: "press", start: p.cell, indices: st.selected, moved: false, warned: false, dx: 0, dy: 0, ok: true, keepArea: false };
      }
      this.ctx.changed();
      return;
    }
    const additive = p.shift || p.mod;
    if (!additive) st.clearSelection();
    this.gesture = { kind: "box", from: p.cell, to: p.cell, additive, base: st.selected };
    this.ctx.changed();
  }

  pointerMove(p: MapLayerPointer): void {
    this.hover = p.cell;
    const st = this.state;
    const g = this.gesture;
    if (!st) return;
    if (!g) {
      const next = this.cellHit(this.markers(st), p.cell) !== null ? "event" : (this.edgeAt(st, p.world)?.edge ?? (hitEvent(this.markers(st), p.world, p.cell) !== null ? "event" : null));
      if (next !== this.hoverKind) {
        this.hoverKind = next;
        this.ctx.changed();
      }
      return;
    }
    if (g.kind === "press") this.dragMove(st, g, p);
    else if (g.kind === "box") {
      if (g.to.x === p.cell.x && g.to.y === p.cell.y && st.drag) return;
      g.to = p.cell;
      if (g.to.x !== g.from.x || g.to.y !== g.from.y || st.drag) st.setDrag({ kind: "box", from: g.from, to: g.to });
    } else {
      if (st.locked) {
        if (!g.warned) {
          g.warned = true;
          this.notice(st.locked);
        }
        return;
      }
      const area = dragAreaEdge(g.start, g.edge, p.cell);
      if (sameArea(area, g.area) && st.drag) return;
      g.area = area;
      g.ok = sameArea(area, g.start) || st.canRun((ed) => ed.setWanderArea(g.index, area));
      st.setDrag({ kind: "area", index: g.index, area, ok: g.ok });
    }
    this.ctx.changed();
  }

  private dragMove(st: EventsLayerState, g: Extract<Gesture, { kind: "press" }>, p: MapLayerPointer): void {
    const dx = p.cell.x - g.start.x;
    const dy = p.cell.y - g.start.y;
    if (!g.moved && dx === 0 && dy === 0) return;
    if (st.locked) {
      if (!g.warned) {
        g.warned = true;
        this.notice(st.locked);
      }
      return;
    }
    g.moved = true;
    if (dx === g.dx && dy === g.dy && p.alt === g.keepArea && st.drag) return;
    g.dx = dx;
    g.dy = dy;
    g.keepArea = p.alt;
    g.ok = (dx === 0 && dy === 0) || st.canRun((ed) => ed.moveEvents(g.indices, dx, dy, { keepArea: p.alt }));
    st.setDrag({ kind: "move", indices: g.indices, dx, dy, ok: g.ok, keepArea: p.alt });
  }

  pointerUp(p: MapLayerPointer): void {
    this.hover = p.cell;
    const st = this.state;
    const g = this.gesture;
    this.gesture = null;
    if (!st || !g) return;
    if (g.kind === "press") this.dragMove(st, g, p);
    st.setDrag(null);
    if (g.kind === "press") {
      if (g.moved && (g.dx !== 0 || g.dy !== 0)) {
        const r = st.run((ed) => ed.moveEvents(g.indices, g.dx, g.dy, { keepArea: g.keepArea }), { select: true });
        if (!r.ok) this.notice(`이 타일로 이동 불가, 원래 위치 유지: ${r.reason}`);
      }
    } else if (g.kind === "box") {
      g.to = p.cell;
      if (g.to.x !== g.from.x || g.to.y !== g.from.y) {
        const hits = eventsInBox(this.markers(st), g.from, g.to);
        st.select(g.additive ? [...new Set([...g.base, ...hits])] : hits);
      }
    } else if (!st.locked) {
      g.area = dragAreaEdge(g.start, g.edge, p.cell);
      if (!sameArea(g.area, g.start)) {
        const area = g.area;
        const r = st.run((ed) => ed.setWanderArea(g.index, area));
        if (!r.ok) this.notice(`배회 영역 변경 불가: ${r.reason}`);
      }
    }
    this.ctx.changed();
  }

  doubleClick(p: MapLayerPointer): void {
    this.hover = p.cell;
    const st = this.state;
    this.cancelGesture(st);
    if (!st || p.button !== 0) return;
    const hit = hitEvent(this.markers(st), p.world, p.cell);
    if (hit !== null) {
      st.select([hit]);
      st.requestFocus("commands");
      return;
    }
    const r = st.run((ed) => ed.addEvent(p.cell), { select: true });
    if (r.ok) st.requestFocus("id");
    else this.notice(`이 타일에 이벤트 추가 불가: ${r.reason}`);
    this.ctx.changed();
  }

  pointerLeave(): void {
    if (this.hoverKind !== null) {
      this.hoverKind = null;
      this.ctx.changed();
    }
  }

  // ---- 키 ----

  keyDown(k: MapLayerKey): boolean {
    const st = this.state;
    if (!st) return false;
    const selected = st.selected;
    if (k.mod && !k.alt) {
      switch (k.key.toLowerCase()) {
        case "c":
          this.copy(st, selected);
          return true;
        case "v":
          this.paste(st);
          return true;
        case "d":
          this.duplicate(st, selected);
          return true;
        case "a":
          st.select(this.markers(st).map((m) => m.index));
          this.ctx.changed();
          return true;
        default:
          return false;
      }
    }
    if (k.mod) return false;
    if (k.key === "Escape") {
      if (this.cancelGesture(st)) return true;
      if (selected.length > 0) {
        st.clearSelection();
        return true;
      }
      return false;
    }
    if (selected.length === 0) return false;
    if (k.key === "Delete" || k.key === "Backspace") {
      const r = st.run((ed) => ed.removeEvents(selected));
      if (r.ok) st.clearSelection();
      else this.notice(r.reason);
      return true;
    }
    const arrow = ARROWS[k.key];
    if (arrow) {
      const r = st.run((ed) => ed.moveEvents(selected, arrow[0], arrow[1], { keepArea: k.alt }), { select: true });
      if (!r.ok) this.notice(`이벤트 이동 불가: ${r.reason}`);
      return true;
    }
    if (k.key === "Enter" && st.primary !== null) {
      st.requestFocus("commands");
      return true;
    }
    return false;
  }

  private objectIndices(st: EventsLayerState, indices: readonly number[]): number[] {
    return indices.filter((i) => isPlainObject(st.section.list[i]));
  }

  private copy(st: EventsLayerState, selected: readonly number[]): void {
    const indices = this.objectIndices(st, selected);
    if (indices.length === 0) {
      this.notice("선택한 이벤트 없음");
      return;
    }
    this.clipboard.write(st.editor.copyEvents(indices));
    this.notice(`이벤트 ${indices.length}개 복사됨`);
  }

  private paste(st: EventsLayerState): void {
    const events = this.clipboard.read();
    if (!events) {
      this.notice("붙여넣을 이벤트 없음 (먼저 복사 필요)");
      return;
    }
    const cell = this.hover;
    if (!cell) {
      this.notice("포인터가 맵의 타일 위에 없음 (붙여넣을 타일 위에 포인터 필요)");
      return;
    }
    const r = st.run((ed) => ed.pasteEvents(events, cell), { select: true });
    if (!r.ok) this.notice(`이 타일에 붙여넣기 불가: ${r.reason}`);
    this.ctx.changed();
  }

  private duplicate(st: EventsLayerState, selected: readonly number[]): void {
    const indices = this.objectIndices(st, selected);
    if (indices.length === 0) {
      this.notice("선택한 이벤트 없음");
      return;
    }
    if (st.locked) {
      this.notice(st.locked);
      return;
    }
    const copies = st.editor.copyEvents(indices);
    const first = eventCell(copies[0]);
    if (!first) {
      this.notice("좌표가 잘못된 이벤트는 복제 불가");
      return;
    }
    for (const [dx, dy] of DUPLICATE_OFFSETS) {
      const cell = { x: first.x + dx, y: first.y + dy };
      if (!st.canRun((ed) => ed.pasteEvents(copies, cell))) continue;
      st.run((ed) => ed.pasteEvents(copies, cell), { select: true });
      this.ctx.changed();
      return;
    }
    this.notice("인접한 빈 타일 없음 (복제 불가)");
  }

  // ---- 모양 ----

  cursor(): string {
    const g = this.gesture;
    if (g?.kind === "press" && g.moved) return "grabbing";
    const edge = g?.kind === "area" ? g.edge : this.hoverKind;
    if (edge === "left" || edge === "right") return "ew-resize";
    if (edge === "top" || edge === "bottom") return "ns-resize";
    if (edge === "event") return "pointer";
    return "default";
  }

  wantsRightButton(): boolean {
    return false;
  }

  busy(): boolean {
    return this.gesture !== null;
  }

  dispose(): void {
    this.cancelGesture(this.state);
  }
}
