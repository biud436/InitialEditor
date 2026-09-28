// 맵 뷰의 도구 (포인터와 키 처리). PIXI와 DOM을 모른다: 렌더러가 포인터를 월드 좌표로 바꿔 넘기고,
// 도구는 문서에 명령을 넣고 미리보기(preview)와 커서 모양(cursor)을 고친 뒤 ctx.changed()로 알린다.
//
//   pen      붓을 찍는다. 끌면 지난 칸부터 선을 따라 찍고, 한 번의 끌기가 되돌리기 한 단계다
//   rect     사각형을 끌어 붓 무늬로 채운다 (놓을 때 한 번)
//   fill     이어진 같은 칸을 붓 무늬로 채운다. 한도는 맵의 칸 수이고, 닿으면 알리고 콘솔에 남긴다
//   erase    빈 칸(0) 붓의 펜
//   pick     칸이나 사각형에서 붓을 뜨고 펜으로 돌아간다
//   collision 통행을 칠한다. 왼쪽은 막힘(1), 오른쪽이나 Alt는 지나감(0)
//   object   고르기(Shift는 더하고 빼기), 끌어 옮기기, 범위 손잡이와 띠 가장자리 끌기, 빈 곳 끌기는 상자 선택,
//            방향키 1px(Shift는 한 칸), Delete는 지우기, Escape는 선택 풀기.
//            뷰 폭의 반보다 넓은 띠(구간)의 안쪽은 클릭하면 고르고, 끌면 옮기지 않고 상자 선택이다.
//            순찰 범위가 있는 점을 옮기면 범위도 같이 옮긴다 (Alt는 몸통만)
//   ext      대상이 확장 레이어(docs/plans/e5-rpg.md 2.2)면 포인터와 키를 그 레이어의 도구(MapLayerTool)에 넘긴다.
//            키는 Ctrl 조합도 여기의 다른 규칙보다 먼저 넘긴다. 도구가 처리하면 렌더러가 전파를 막아 전역 단축키에 닿지 않는다
// 대상이 통행이면 타일 도구도 통행을 칠한다 (펜과 사각형과 채우기는 1, 지우개는 0).
// 대상 레이어나 통행을 숨겼으면 칠하지 않는다 (ctx.notice로 알린다). 숨긴 확장 레이어도 포인터와 편집 키를 도구에 넘기지 않고 알린다.

import type { Command } from "@initial-editor/core";
import type { MapLayerPointer, MapLayerTool } from "@initial-editor/ext-tilemap";
import { runInAction } from "mobx";
import {
  ERASER,
  floodFillArea,
  pickBrush,
  rectFill,
  singleBrush,
  tileSource,
  typeOf,
  type Brush,
  type CellChange,
  type MapDocument,
  type MapModel,
} from "@initial-editor/ext-tilemap/model";
import {
  isLargeBand,
  bandEdgeDrag,
  cellAt,
  cellRange,
  clampRange,
  hitObject,
  moveTargets,
  nudgeStep,
  onlyChanged,
  rangeDragValue,
  rectFromPoints,
  shapeOf,
  shapesInRect,
  strokeChanges,
  strokeSegment,
  type Cell,
  type MoveStart,
  type MoveTarget,
  type ObjectShape,
  type Point,
  type RangeInfo,
  type Rect,
} from "./mapGeometry";

export interface ToolPointer {
  world: Point;
  /** 0 왼쪽, 2 오른쪽 */
  button: number;
  shift: boolean;
  alt: boolean;
  /** Ctrl이나 Cmd (확장 레이어 도구에 넘긴다) */
  mod?: boolean;
}

export interface ToolKey {
  key: string;
  shift: boolean;
  alt: boolean;
  /** Ctrl이나 Cmd */
  mod: boolean;
}

export type PreviewTone = "accent" | "danger" | "muted";

export type ToolPreview =
  | { kind: "none" }
  /** 붓 미리보기(반투명 타일)와 그 테두리 */
  | { kind: "brush"; cell: Cell; brush: Brush }
  /** 칸 범위 테두리 (호버한 칸, 끄는 사각형, 스포이드 범위). fill이면 안을 옅게 칠한다 */
  | { kind: "cells"; x0: number; y0: number; x1: number; y1: number; tone: PreviewTone; fill: boolean }
  /** 오브젝트 상자 선택 (월드) */
  | { kind: "box"; rect: Rect };

export interface ToolContext {
  readonly document: MapDocument;
  /** 지금 줌 (맞히기 여유를 월드로 바꾸는 데 쓴다) */
  zoom(): number;
  /** 미리보기나 커서가 바뀌었다 */
  changed(): void;
  /** 뷰의 화면 폭 (넓은 띠를 가르는 데 쓴다). 없으면 넓은 띠가 없다 */
  viewWidth?(): number;
  /** 사용자에게 짧게 알린다 (숨긴 대상에 칠하려 할 때) */
  notice?(message: string): void;
  /** 알림과 함께 콘솔에 경고 한 줄을 남긴다 (한도에 닿은 채우기). 없으면 notice로 알린다 */
  warn?(message: string): void;
  /** 확장 레이어의 도구 (렌더러가 레이어마다 만든다). 없으면 null */
  layerTool?(id: string): MapLayerTool | null;
}

/** 채우기가 한도에 닿았을 때의 안내 */
export function fillLimitNotice(filled: number, limit: number): string {
  return `채우기 한도(타일 ${limit.toLocaleString("en-US")}개) 도달: 타일 ${filled.toLocaleString("en-US")}개 채움. 남은 영역을 다시 클릭하면 이어서 채움`;
}

export const HIDDEN_TARGET_NOTICE = "숨긴 레이어나 통행에는 칠하기 불가 (레이어 패널에서 보이기를 켜면 가능)";
export const HIDDEN_EXT_NOTICE = "숨긴 레이어는 편집 불가 (레이어 패널에서 보이기를 켜면 가능)";

/** 칠하거나 고칠 대상(타일 레이어, 통행, 확장 레이어)을 숨겼는가 */
export function targetHidden(doc: MapDocument): boolean {
  const t = doc.target;
  if (t.kind === "collision") return !doc.showCollision;
  if (t.kind === "layer") return doc.hiddenLayers.has(t.index);
  if (t.kind === "ext") return doc.hiddenExtLayers.has(t.id);
  return false;
}

/** 숨긴 확장 레이어가 대상일 때 도구에 넘기지 않고 알리는 편집 키 (지우기, 옮기기, 붙여넣기, 복제, 잘라내기) */
function isEditKey(k: ToolKey): boolean {
  if (k.alt) return false;
  if (k.mod) return ["v", "d", "x"].includes(k.key.toLowerCase());
  return k.key === "Delete" || k.key === "Backspace" || k.key.startsWith("Arrow");
}

type Gesture =
  | { kind: "paint"; key: string; target: number | "collision"; brush: Brush; origin: Cell; last: Cell | null }
  | { kind: "rect"; target: number | "collision"; brush: Brush; from: Cell; to: Cell }
  | { kind: "pick"; layer: number; from: Cell; to: Cell }
  | { kind: "press"; start: Point; starts: MoveStart[] }
  | { kind: "move"; key: string; start: Point; starts: MoveStart[]; last: string }
  /** 손잡이와 가장자리: press는 누른 점, edge는 그때의 값. 문턱을 넘기 전(dragging false)에는 고치지 않는다 */
  | { kind: "range"; key: string; id: string; part: "rangeMin" | "rangeMax"; range: RangeInfo; press: Point; edge: number; dragging: boolean; last: number | null }
  | { kind: "band"; key: string; id: string; part: "bandLeft" | "bandRight"; start: { x: number; width: number }; press: Point; edge: number; dragging: boolean; last: string }
  /** 넓은 띠의 안쪽을 눌렀다: 놓으면 고르고, 끌면 상자 선택 */
  | { kind: "bandPress"; id: string; start: Point; additive: boolean }
  | { kind: "box"; start: Point; current: Point; additive: boolean };

/** 혼자서는 확장 레이어 도구에 넘기지 않는 조합 키 */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Control", "Meta", "Shift", "Alt", "AltGraph", "CapsLock", "Fn"]);

/** 이만큼(화면 픽셀) 움직여야 오브젝트 끌기다 */
export const DRAG_THRESHOLD_PX = 3;

let gestureCounter = 0;

/** 여러 명령을 한 단계로 묶되, 같은 키의 다음 묶음과 칸별로 합친다 (띠 가장자리 끌기의 x와 폭, 범위가 있는 점 옮기기) */
export function mergeableCompound(label: string, parts: Command[], coalesceKey?: string): Command {
  const cmd: Command & { parts: Command[] } = {
    label,
    coalesceKey,
    parts,
    execute: () => parts.forEach((c) => c.execute()),
    undo: () => [...parts].reverse().forEach((c) => c.undo()),
    merge(next) {
      const other = (next as typeof cmd).parts;
      if (!other || other.length !== parts.length) return false;
      return parts.every((p, i) => p.merge?.(other[i]) ?? false);
    },
  };
  return cmd;
}

export class MapToolController {
  preview: ToolPreview = { kind: "none" };
  /** CSS cursor 값 */
  cursor = "default";
  /** 채우기 한 번의 칸 한도. null이면 맵의 칸 수 */
  fillLimit: number | null = null;
  private gesture: Gesture | null = null;
  private hover: Point | null = null;

  constructor(private readonly ctx: ToolContext) {}

  private get doc(): MapDocument {
    return this.ctx.document;
  }

  private get model(): MapModel {
    return this.ctx.document.model;
  }

  /** 지금 끄는 중인가 */
  get busy(): boolean {
    return this.gesture !== null || (this.extTool()?.busy?.() ?? false);
  }

  /** 대상인 확장 레이어의 눈을 껐는가. 그러면 포인터와 편집 키를 도구에 넘기지 않는다 */
  extHidden(): boolean {
    const t = this.doc.target;
    return t.kind === "ext" && this.doc.hiddenExtLayers.has(t.id);
  }

  /** 대상이 상태가 붙은 확장 레이어면 그 도구. 아니면 null */
  extTool(): MapLayerTool | null {
    const t = this.doc.target;
    if (t.kind !== "ext" || this.doc.tool !== "ext" || !this.doc.layerState(t.id)) return null;
    return this.ctx.layerTool?.(t.id) ?? null;
  }

  private layerPointer(p: ToolPointer): MapLayerPointer {
    return { world: p.world, cell: this.cellOf(p.world), button: p.button, shift: p.shift, alt: p.alt, mod: p.mod ?? false };
  }

  /** 칠할 대상. 타일 레이어 번호나 통행. 오브젝트가 대상이거나 대상을 숨겼으면 null */
  paintTarget(): number | "collision" | null {
    const t = this.doc.target;
    if (targetHidden(this.doc)) return null;
    if (t.kind === "collision") return "collision";
    if (t.kind === "layer") return t.index >= 0 && t.index < this.model.layers.length ? t.index : null;
    return null;
  }

  /** 문턱(화면 픽셀)을 넘게 움직였는가 */
  private pastThreshold(from: Point, to: Point): boolean {
    const zoom = this.ctx.zoom();
    return Math.abs(to.x - from.x) * zoom >= DRAG_THRESHOLD_PX || Math.abs(to.y - from.y) * zoom >= DRAG_THRESHOLD_PX;
  }

  /** 오른쪽 버튼을 도구가 쓰는가 (통행 칠하기의 지우기). 아니면 렌더러가 팬으로 쓴다 */
  wantsRightButton(): boolean {
    const tool = this.doc.tool;
    if (tool === "ext") return this.extTool()?.wantsRightButton?.() ?? false;
    return this.paintTarget() === "collision" && tool !== "pick" && tool !== "object";
  }

  private brushFor(target: number | "collision", p: { button: number; alt: boolean }): Brush {
    const tool = this.doc.tool;
    if (target === "collision") return singleBrush(tool === "erase" || p.alt || p.button === 2 ? 0 : 1);
    if (tool === "erase") return ERASER;
    return this.doc.brush;
  }

  private dataOf(target: number | "collision"): readonly number[] | null {
    return target === "collision" ? this.model.collision : this.model.layers[target]?.data ?? null;
  }

  private cellOf(p: Point): Cell {
    return cellAt(p, this.model.tileWidth, this.model.tileHeight);
  }

  private apply(target: number | "collision", changes: CellChange[], key?: string): void {
    const real = onlyChanged(this.dataOf(target), changes);
    if (real.length > 0) this.doc.apply(this.model.paintCells(target, real, key));
  }

  /** 맞히기 대상 모양. 오브젝트를 숨겼으면 없다 */
  shapes(): ObjectShape[] {
    if (!this.doc.showObjects) return [];
    const schema = this.doc.schema;
    return this.model.objects.map((o) => shapeOf(o, typeOf(schema, o.type)));
  }

  // ---- 포인터 ----

  pointerDown(p: ToolPointer): void {
    this.hover = p.world;
    const tool = this.doc.tool;
    if (tool === "ext") {
      if (this.extHidden()) this.ctx.notice?.(HIDDEN_EXT_NOTICE);
      else this.extTool()?.pointerDown?.(this.layerPointer(p));
      this.update();
      return;
    }
    if (tool === "object") {
      this.objectDown(p);
      this.update();
      return;
    }
    const target = this.paintTarget();
    const cell = this.cellOf(p.world);
    if (tool === "pick") {
      const layer = this.doc.target.kind === "layer" ? this.doc.target.index : 0;
      if (this.model.layers[layer]) this.gesture = { kind: "pick", layer, from: cell, to: cell };
      this.update();
      return;
    }
    if (target === null) {
      if (targetHidden(this.doc)) this.ctx.notice?.(HIDDEN_TARGET_NOTICE);
      return;
    }
    const brush = this.brushFor(target, p);
    if (tool === "rect") {
      this.gesture = { kind: "rect", target, brush, from: cell, to: cell };
    } else if (tool === "fill") {
      const data = this.dataOf(target) ?? new Array<number>(this.model.width * this.model.height).fill(0);
      const fill = floodFillArea(this.model, data, brush, cell.x, cell.y, this.fillLimit ?? undefined);
      this.apply(target, fill.changes);
      if (fill.truncated) {
        const message = fillLimitNotice(fill.changes.length, fill.limit);
        if (this.ctx.warn) this.ctx.warn(message);
        else this.ctx.notice?.(message);
      }
    } else {
      // pen, erase, collision
      this.gesture = { kind: "paint", key: `map-paint:${++gestureCounter}`, target, brush, origin: cell, last: null };
      this.paintTo(cell);
    }
    this.update();
  }

  pointerMove(p: ToolPointer): void {
    this.hover = p.world;
    if (this.doc.tool === "ext") {
      if (!this.extHidden()) this.extTool()?.pointerMove?.(this.layerPointer(p));
      this.update();
      return;
    }
    const g = this.gesture;
    if (g) {
      const cell = this.cellOf(p.world);
      switch (g.kind) {
        case "paint":
          this.paintTo(cell);
          break;
        case "rect":
        case "pick":
          g.to = cell;
          break;
        case "press":
        case "move":
        case "range":
        case "band":
        case "bandPress":
        case "box":
          this.objectMove(g, p);
          break;
      }
    }
    this.update();
  }

  pointerUp(p: ToolPointer | null): void {
    const g = this.gesture;
    this.gesture = null;
    if (p) this.hover = p.world;
    if (this.doc.tool === "ext" && p && !this.extHidden()) this.extTool()?.pointerUp?.(this.layerPointer(p));
    if (g?.kind === "rect") {
      const r = cellRange(g.from, g.to);
      this.apply(g.target, rectFill(this.model, g.brush, r.x0, r.y0, r.x1, r.y1));
    } else if (g?.kind === "pick") {
      this.finishPick(g);
    } else if (g?.kind === "bandPress") {
      // 끌지 않은 클릭: 띠를 고른다 (Shift는 더하고 빼기)
      const doc = this.doc;
      if (!g.additive) doc.select([g.id]);
      else if (doc.selection.has(g.id)) doc.select(doc.selectedIds.filter((id) => id !== g.id));
      else doc.select([g.id], true);
    } else if (g?.kind === "box") {
      const rect = rectFromPoints(g.start, g.current);
      const hits = shapesInRect(this.shapes(), rect, this.model.pixelHeight);
      if (g.additive) this.doc.select(hits, true);
      else this.doc.select(hits);
    }
    this.update();
  }

  /** 더블클릭 (확장 레이어 도구만 받는다) */
  doubleClick(p: ToolPointer): void {
    this.hover = p.world;
    if (this.doc.tool !== "ext") return;
    if (this.extHidden()) this.ctx.notice?.(HIDDEN_EXT_NOTICE);
    else this.extTool()?.doubleClick?.(this.layerPointer(p));
    this.update();
  }

  /** 포인터가 뷰를 떠났다. 끄는 중이 아니면 미리보기를 지운다 */
  pointerLeave(): void {
    if (this.busy) return;
    this.hover = null;
    this.extTool()?.pointerLeave?.();
    this.update();
  }

  /** 끌기를 버린다 (사각형과 상자는 적용하지 않는다. 이미 칠한 붓질은 남는다) */
  cancel(): void {
    this.gesture = null;
    this.update();
  }

  /** 도구나 붓이 바뀌었다: 지금 자리의 미리보기를 다시 만든다 */
  refresh(): void {
    this.update();
  }

  private paintTo(cell: Cell): void {
    const g = this.gesture;
    if (g?.kind !== "paint") return;
    const cells = strokeSegment(g.last, cell);
    g.last = cell;
    if (cells.length === 0) return;
    this.apply(g.target, strokeChanges(this.model, g.brush, g.origin, cells), g.key);
  }

  private finishPick(g: Extract<Gesture, { kind: "pick" }>): void {
    const r = clampRange(cellRange(g.from, g.to), this.model);
    const data = this.model.layers[g.layer]?.data;
    if (!r || !data) return;
    const brush = pickBrush(this.model, data, r.x0, r.y0, r.x1, r.y1);
    const first = brush.gids.flat().find((gid) => gid > 0);
    const doc = this.doc;
    if (first !== undefined) {
      const src = tileSource(this.model.tilesets, first, this.model.tileWidth, this.model.tileHeight);
      if (src) runInAction(() => (doc.paletteTileset = src.tilesetIndex));
    }
    doc.setBrush(brush);
    doc.setTarget({ kind: "layer", index: g.layer });
  }

  // ---- 오브젝트 ----

  private objectDown(p: ToolPointer): void {
    if (p.button !== 0) return;
    const doc = this.doc;
    const hit = hitObject(this.shapes(), p.world, this.ctx.zoom(), this.model.pixelHeight);
    if (!hit) {
      if (!p.shift) doc.clearSelection();
      this.gesture = { kind: "box", start: p.world, current: p.world, additive: p.shift };
      return;
    }
    const key = `map-object:${++gestureCounter}`;
    const obj = this.model.findObject(hit.id)!;
    const shape = shapeOf(obj, typeOf(doc.schema, obj.type));
    if (hit.part !== "body") {
      if (!doc.selection.has(hit.id)) doc.select([hit.id], p.shift);
      if ((hit.part === "rangeMin" || hit.part === "rangeMax") && shape.kind === "point" && shape.range) {
        const edge = hit.part === "rangeMin" ? shape.range.min : shape.range.max;
        this.gesture = { kind: "range", key, id: hit.id, part: hit.part, range: shape.range, press: p.world, edge, dragging: false, last: null };
      } else if ((hit.part === "bandLeft" || hit.part === "bandRight") && shape.kind === "band") {
        const edge = hit.part === "bandLeft" ? shape.x : shape.x + shape.width;
        this.gesture = { kind: "band", key, id: hit.id, part: hit.part, start: { x: shape.x, width: shape.width }, press: p.world, edge, dragging: false, last: "" };
      }
      return;
    }
    // 고르지 않은 큰 띠(구간처럼 넓거나 다른 오브젝트를 품은 띠)의 몸통: 누르고 떼면 고르고, 끌면 상자 선택이다.
    // 구간 띠가 맵 전체를 덮어도 빈 땅에서 상자 선택이 된다. 고른 뒤에 끌면 옮긴다
    if (!doc.selection.has(hit.id) && isLargeBand(shape, this.shapes(), this.model.tileWidth)) {
      this.gesture = { kind: "bandPress", id: hit.id, start: p.world, additive: p.shift };
      return;
    }
    if (p.shift) {
      // Shift: 더하거나 빼고, 끌지는 않는다
      if (doc.selection.has(hit.id)) doc.select(doc.selectedIds.filter((id) => id !== hit.id));
      else doc.select([hit.id], true);
      return;
    }
    if (!doc.selection.has(hit.id)) doc.select([hit.id]);
    this.gesture = { kind: "press", start: p.world, starts: this.moveStarts() };
  }

  private moveStarts(): MoveStart[] {
    const doc = this.doc;
    return doc.selectedIds.map((id) => {
      const o = this.model.findObject(id)!;
      const shape = shapeOf(o, typeOf(doc.schema, o.type));
      return { id, x: o.x, y: o.y, lockY: shape.kind === "band", range: shape.kind === "point" ? shape.range : null };
    });
  }

  /** 옮기기 명령. 범위가 있는 점은 범위 칸 둘도 같은 한 단계로 고친다 */
  private moveCommand(moves: MoveTarget[], key?: string): Command {
    const model = this.model;
    const ranged = moves.filter((m) => m.range);
    const move = model.moveObjects(
      moves.map((m) => ({ id: m.id, x: m.x, y: m.y })),
      ranged.length === 0 ? key : undefined,
    );
    if (ranged.length === 0) return move;
    const props = ranged.flatMap((m) => [model.setObjectProp(m.id, m.range!.minField, m.range!.min), model.setObjectProp(m.id, m.range!.maxField, m.range!.max)]);
    return mergeableCompound(move.label, [move, ...props], key);
  }

  private objectMove(g: Gesture, p: ToolPointer): void {
    const doc = this.doc;
    const model = this.model;
    if (g.kind === "box") {
      g.current = p.world;
      return;
    }
    if (g.kind === "bandPress") {
      if (!this.pastThreshold(g.start, p.world)) return;
      if (!g.additive) doc.clearSelection();
      this.gesture = { kind: "box", start: g.start, current: p.world, additive: g.additive };
      return;
    }
    if (g.kind === "press") {
      if (!this.pastThreshold(g.start, p.world)) return;
      this.gesture = { kind: "move", key: `map-object:${++gestureCounter}`, start: g.start, starts: g.starts, last: "" };
      this.objectMove(this.gesture, p);
      return;
    }
    if (g.kind === "move") {
      const moves = moveTargets(g.starts, p.world.x - g.start.x, p.world.y - g.start.y, model.pixelWidth, p.alt);
      const signature = moves.map((m) => `${m.id}:${m.x},${m.y}:${m.range?.min ?? ""}`).join("|");
      if (signature === g.last) return;
      g.last = signature;
      doc.apply(this.moveCommand(moves, g.key));
      return;
    }
    if ((g.kind === "range" || g.kind === "band") && !g.dragging) {
      if (!this.pastThreshold(g.press, p.world)) return;
      g.dragging = true;
    }
    if (g.kind === "range") {
      // 누른 점과의 차이만큼 옮긴다 (손잡이로 튀지 않는다)
      const { field, value } = rangeDragValue(g.range, g.part, g.edge + (p.world.x - g.press.x), model.pixelWidth);
      if (value === g.last) return;
      g.last = value;
      doc.apply(model.setObjectProp(g.id, field, value, g.key));
      return;
    }
    if (g.kind === "band") {
      const next = bandEdgeDrag(g.start, g.part, g.edge + (p.world.x - g.press.x));
      const signature = `${next.x},${next.width}`;
      if (signature === g.last) return;
      g.last = signature;
      doc.apply(
        mergeableCompound(`너비 변경: ${g.id}`, [model.setObjectField(g.id, "x", next.x), model.setObjectField(g.id, "width", next.width)], g.key),
      );
    }
  }

  // ---- 키 ----

  /** 뷰에 초점이 있을 때의 키. 처리했으면 true (렌더러가 기본 동작을 막는다) */
  keyDown(k: ToolKey): boolean {
    const doc = this.doc;
    // 확장 레이어 도구가 먼저 받는다 (Ctrl+C, Ctrl+V, Ctrl+D, Delete 도). 아래의 Ctrl 거르기보다 앞이다.
    // 조합 키만 누른 것(Control, Meta 등)은 넘기지 않는다
    const ext = MODIFIER_KEYS.has(k.key) ? null : this.extTool();
    if (ext && this.extHidden()) {
      // 숨긴 레이어는 고치지 않는다 (타일 레이어의 칠하기와 같다). 편집 키만 알리고 나머지(되돌리기, 저장)는 흘려보낸다
      if (!isEditKey(k)) return false;
      this.ctx.notice?.(HIDDEN_EXT_NOTICE);
      return true;
    }
    if (ext?.keyDown?.({ key: k.key, shift: k.shift, alt: k.alt, mod: k.mod })) {
      this.update();
      return true;
    }
    if (k.key === "Escape") {
      if (this.gesture) {
        this.cancel();
        return true;
      }
      if (doc.selection.size > 0) {
        doc.clearSelection();
        return true;
      }
      return false;
    }
    if (k.mod || k.alt || doc.tool !== "object") return false;
    const ids = doc.selectedIds;
    if (ids.length === 0) return false;
    if (k.key === "Delete" || k.key === "Backspace") {
      doc.apply(this.model.removeObjects(ids));
      doc.clearSelection();
      return true;
    }
    const step = nudgeStep(k.key, k.shift, this.model.tileWidth, this.model.tileHeight);
    if (!step) return false;
    const moves = moveTargets(this.moveStarts(), step.x, step.y, this.model.pixelWidth);
    doc.apply(this.moveCommand(moves));
    return true;
  }

  // ---- 미리보기 ----

  private update(): void {
    this.preview = this.computePreview();
    this.cursor = this.computeCursor();
    this.ctx.changed();
  }

  private computePreview(): ToolPreview {
    const g = this.gesture;
    const tone: PreviewTone = this.paintTarget() === "collision" || this.doc.tool === "erase" ? "danger" : "accent";
    if (g?.kind === "rect") {
      const blocked = g.brush.gids[0][0] !== 0;
      return { kind: "cells", ...cellRange(g.from, g.to), tone: g.target === "collision" ? (blocked ? "danger" : "muted") : "accent", fill: true };
    }
    if (g?.kind === "pick") return { kind: "cells", ...cellRange(g.from, g.to), tone: "accent", fill: true };
    if (g?.kind === "box") return { kind: "box", rect: rectFromPoints(g.start, g.current) };
    if (!this.hover || g) return { kind: "none" };
    const tool = this.doc.tool;
    if (tool === "object" || tool === "ext") return { kind: "none" };
    if (tool !== "pick" && targetHidden(this.doc)) return { kind: "none" };
    const cell = this.cellOf(this.hover);
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.model.width || cell.y >= this.model.height) return { kind: "none" };
    const target = this.paintTarget();
    if ((tool === "pen" || tool === "rect") && typeof target === "number") return { kind: "brush", cell, brush: this.doc.brush };
    return { kind: "cells", x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y, tone: tool === "pick" || tool === "fill" ? "accent" : tone, fill: false };
  }

  private computeCursor(): string {
    const g = this.gesture;
    const tool = this.doc.tool;
    if (tool === "ext") return this.extHidden() ? "not-allowed" : (this.extTool()?.cursor?.() ?? "default");
    if (tool !== "object") return tool !== "pick" && targetHidden(this.doc) ? "not-allowed" : "crosshair";
    if (g?.kind === "move") return "move";
    if (g?.kind === "range" || g?.kind === "band") return "ew-resize";
    if (!this.hover) return "default";
    const shapes = this.shapes();
    const hit = hitObject(shapes, this.hover, this.ctx.zoom(), this.model.pixelHeight);
    if (!hit) return "default";
    if (hit.part !== "body") return "ew-resize";
    const shape = shapes.find((s) => s.id === hit.id);
    return shape && !this.doc.selection.has(hit.id) && isLargeBand(shape, shapes, this.model.tileWidth) ? "default" : "move";
  }

  /** 마지막 호버 칸 (뷰 밖이면 null) */
  hoverCell(): Cell | null {
    return this.hover ? this.cellOf(this.hover) : null;
  }
}
