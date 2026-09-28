// 맵 오브젝트 조작. 전부 명령(document.apply)으로 들어가 되돌리기 한 단계가 된다.
// 오브젝트 목록 패널과 인스펙터와 여기서 실행이 같이 쓴다. 맵 뷰(editor.mapSupport)는 있을 때만 쓴다.

import { compound, typeOf, type MapDocument, type MapObject, type ObjectProblem } from "@initial-editor/ext-tilemap/model";
import type { Command, LogStore } from "@initial-editor/core";
import { runInAction } from "mobx";
import { PATROL_RADIUS, planDuplicate, planNewObject, rangeAround, rangeFields, validateRename, type MapGeometry, type Point } from "./rules";

const LOG = "maps";

export interface MapObjectHost {
  readonly toasts: { info(text: string): unknown; success(text: string): unknown; warn(text: string): unknown; error(text: string): unknown };
  readonly log: LogStore;
  /** 맵 뷰 (다른 모듈이 붙인다). 모양을 모르므로 mapSupportOf로 본다 */
  readonly mapSupport?: unknown;
}

/** 맵 뷰가 주는 것 중 여기서 쓰는 것 */
export interface MapSupportLike {
  activeMap?: unknown;
  viewCenter?: () => Point | null;
  cursor?: Point | null | (() => Point | null);
  focusObject?: (id: string) => void;
}

export function mapSupportOf(host: { mapSupport?: unknown }): MapSupportLike | null {
  const s = host.mapSupport;
  return s && typeof s === "object" ? (s as MapSupportLike) : null;
}

function asPoint(v: unknown): Point | null {
  if (!v || typeof v !== "object") return null;
  const p = v as { x?: unknown; y?: unknown };
  return typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
}

/** 맵 뷰의 화면 가운데 (맵 픽셀 좌표). 맵 뷰가 없으면 null */
export function viewCenterOf(host: { mapSupport?: unknown }): Point | null {
  const s = mapSupportOf(host);
  try {
    return typeof s?.viewCenter === "function" ? asPoint(s.viewCenter()) : null;
  } catch {
    return null;
  }
}

/** 맵 뷰 위의 마우스 자리 (맵 픽셀 좌표). 없으면 null */
export function cursorOf(host: { mapSupport?: unknown }): Point | null {
  const s = mapSupportOf(host);
  try {
    const c = typeof s?.cursor === "function" ? s.cursor() : s?.cursor;
    return asPoint(c);
  } catch {
    return null;
  }
}

export function focusObjectInView(host: { mapSupport?: unknown }, id: string): void {
  const s = mapSupportOf(host);
  try {
    if (typeof s?.focusObject === "function") s.focusObject(id);
  } catch {
    // 맵 뷰가 아직 준비되지 않았으면 선택만 남는다
  }
}

export function geometryOf(doc: MapDocument): MapGeometry {
  const m = doc.model;
  return { pixelWidth: m.pixelWidth, pixelHeight: m.pixelHeight, tileWidth: m.tileWidth, tileHeight: m.tileHeight };
}

/** 새 오브젝트를 놓을 자리: 맵 뷰의 화면 가운데, 없으면 맵 가운데 */
export function spawnPointFor(host: { mapSupport?: unknown }, doc: MapDocument): Point {
  return viewCenterOf(host) ?? { x: Math.round(doc.model.pixelWidth / 2), y: Math.round(doc.model.pixelHeight / 2) };
}

/** 스키마 타입의 새 오브젝트를 더하고 고른다. 못 더하면 토스트로 알리고 null */
export function addMapObject(host: MapObjectHost, doc: MapDocument, type: string, at?: Point): MapObject | null {
  const plan = planNewObject(doc.schema, type, doc.model.objects, at ?? spawnPointFor(host, doc), geometryOf(doc));
  if (!plan.ok) {
    host.toasts.warn(plan.reason);
    return null;
  }
  const obj = plan.object;
  doc.apply(doc.model.addObject(obj));
  doc.select([obj.id]);
  host.log.info(LOG, `오브젝트 추가: ${obj.id} (${typeOf(doc.schema, type)?.label ?? type}) x ${obj.x}, y ${obj.y}${obj.width !== undefined ? `, 너비 ${obj.width}` : ""}`);
  return doc.model.findObject(obj.id) ?? null;
}

/** 오브젝트를 지운다. 지운 수 */
export function deleteMapObjects(doc: MapDocument, ids: readonly string[]): number {
  const present = ids.filter((id) => doc.model.findObject(id));
  if (present.length === 0) return 0;
  doc.apply(doc.model.removeObjects(present));
  runInAction(() => present.forEach((id) => doc.selection.delete(id)));
  return present.length;
}

/** 오브젝트를 원본 바로 뒤에 복제하고(한 칸 오른쪽, y는 그대로) 복제본을 고른다. unique 타입은 건너뛰고 알린다 */
export function duplicateMapObjects(host: MapObjectHost, doc: MapDocument, ids: readonly string[]): string[] {
  const m = doc.model;
  const plan = planDuplicate(doc.schema, m.objects, ids, m.tileWidth, { pixelWidth: m.pixelWidth, pixelHeight: m.pixelHeight });
  if (plan.skipped.length > 0) host.toasts.warn(`맵당 1개만 허용되는 타입이라 복제 제외: ${plan.skipped.join(", ")}`);
  if (plan.copies.length === 0) return [];
  const indexOf = (id: string) => doc.model.objects.findIndex((o) => o.id === id);
  // 뒤쪽 원본부터 끼워야 앞쪽 원본의 색인이 그대로다
  const ordered = [...plan.copies].sort((a, b) => indexOf(b.after) - indexOf(a.after));
  const cmds = ordered.map((c) => doc.model.addObject(c.object, indexOf(c.after) + 1));
  const created = plan.copies.map((c) => c.object.id);
  doc.apply(cmds.length === 1 ? { ...cmds[0], label: `복제: ${created[0]}` } : compound(`오브젝트 ${created.length}개 복제`, cmds));
  doc.select(created);
  return created;
}

/** id 바꾸기. 비었거나 겹치면 토스트로 알리고 false. 선택은 새 id로 옮긴다 */
export function renameMapObject(host: MapObjectHost, doc: MapDocument, id: string, next: string): boolean {
  const value = next.trim();
  const problem = validateRename(id, value, doc.model.objectIds());
  if (problem) {
    host.toasts.warn(problem);
    return false;
  }
  if (value === id) return true;
  const selected = doc.selection.has(id);
  doc.apply(doc.model.renameObject(id, value));
  if (selected) {
    runInAction(() => {
      doc.selection.delete(id);
      doc.selection.add(value);
    });
  }
  return true;
}

/** props 칸 하나를 고친다. 여러 개면 한 번에 되돌리는 묶음 명령이다. value가 undefined면 지운다 */
export function setObjectsProp(doc: MapDocument, ids: readonly string[], key: string, value: unknown, session?: string): void {
  const present = ids.filter((id) => doc.model.findObject(id));
  if (present.length === 0) return;
  if (present.length === 1) {
    doc.apply(doc.model.setObjectProp(present[0], key, value, session));
    return;
  }
  doc.apply(compound(`속성 변경: ${key} (${present.length}개)`, present.map((id) => doc.model.setObjectProp(id, key, value))));
}

/** 한 오브젝트의 props 칸 여럿을 지운다 (되돌리기 한 단계) */
export function clearObjectProps(doc: MapDocument, id: string, keys: readonly string[]): void {
  const o = doc.model.findObject(id);
  const present = keys.filter((k) => o && o.props[k] !== undefined);
  if (present.length === 0) return;
  doc.apply(present.length === 1 ? doc.model.setObjectProp(id, present[0], undefined) : compound(`속성 지우기: ${id} ${present.join(", ")}`, present.map((k) => doc.model.setObjectProp(id, k, undefined))));
}

/** x, y, 폭, 높이 하나. 순찰 범위가 있는 오브젝트의 x 를 바꾸면 범위도 같은 만큼 옮긴다 (맵 뷰에서 끌 때와 같다) */
export function setObjectGeometry(doc: MapDocument, id: string, field: "x" | "y" | "width" | "height", value: number | undefined, session?: string): void {
  const o = doc.model.findObject(id);
  if (!o) return;
  const range = field === "x" && value !== undefined ? rangeFields(typeOf(doc.schema, o.type)) : null;
  const lo = range ? o.props[range.min.name] : undefined;
  const hi = range ? o.props[range.max.name] : undefined;
  if (!range || typeof lo !== "number" || typeof hi !== "number") {
    doc.apply(doc.model.setObjectField(id, field, value, session));
    return;
  }
  const dx = (value as number) - o.x;
  const cmds: Command[] = [
    doc.model.setObjectField(id, "x", value),
    doc.model.setObjectProp(id, range.min.name, lo + dx),
    doc.model.setObjectProp(id, range.max.name, hi + dx),
  ];
  doc.apply(sessionCompound(`오브젝트 이동: ${id}`, cmds, session));
}

/** 여러 명령을 한 단계로 묶고, 같은 세션(타이핑)의 다음 묶음은 여기에 합친다. 되돌리면 첫 묶음 이전으로 간다 */
function sessionCompound(label: string, cmds: Command[], key?: string): Command {
  const first = cmds;
  let latest = cmds;
  const cmd: Command & { cmds: Command[] } = {
    label,
    coalesceKey: key,
    unchanged: cmds.every((c) => c.unchanged === true),
    cmds,
    execute: () => latest.forEach((c) => c.execute()),
    undo: () => [...first].reverse().forEach((c) => c.undo()),
    merge(next) {
      latest = (next as typeof cmd).cmds;
      return true;
    },
  };
  return cmd;
}

/** 범위 칸 한 쌍을 x 기준 ±radius로 (맵 폭 안으로 자른다). 범위 칸이 없으면 false */
export function setRangeAround(doc: MapDocument, id: string, radius = PATROL_RADIUS): boolean {
  const o = doc.model.findObject(id);
  const range = rangeFields(typeOf(doc.schema, o?.type ?? ""));
  if (!o || !range) return false;
  const { min: lo, max: hi } = rangeAround(o.x, doc.model.pixelWidth, radius);
  const cmds: Command[] = [doc.model.setObjectProp(id, range.min.name, lo), doc.model.setObjectProp(id, range.max.name, hi)];
  doc.apply(compound(`범위: ${id} ${lo}..${hi}`, cmds));
  return true;
}

/** 검사 결과 한 줄을 누르면 그 오브젝트를 고르고 맵 뷰에서 보인다 */
export function selectProblem(host: { mapSupport?: unknown }, doc: MapDocument, problem: ObjectProblem): void {
  if (!problem.objectId || !doc.model.findObject(problem.objectId)) return;
  doc.select([problem.objectId]);
  focusObjectInView(host, problem.objectId);
}
