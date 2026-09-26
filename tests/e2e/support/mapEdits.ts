// 두 맵(MapData)의 차이. 저장한 맵이 원본에서 의도한 칸과 오브젝트만 바뀌었는지 볼 때 쓴다.
//   structureChanges  칸과 오브젝트 밖의 차이 (크기, 타일셋, 레이어 이름, events, 모르는 키 등)
//   cellEdits         타일 레이어와 통행의 칸 차이
//   objectEdits       id로 맞춘 오브젝트 차이 (더함, 뺌, 순서, 칸별 바뀜)

import type { MapData, MapObject } from "../../../packages/ext-tilemap/src/model/format";

export interface CellEdit {
  layer: number | "collision";
  index: number;
  x: number;
  y: number;
  before: number;
  after: number;
}

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

export type ObjectEdit =
  | { kind: "added"; id: string }
  | { kind: "removed"; id: string }
  | { kind: "order"; before: string[]; after: string[] }
  | { kind: "changed"; id: string; changes: FieldChange[] };

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 칸과 오브젝트 밖의 차이를 사람이 읽는 글로 */
export function structureChanges(before: MapData, after: MapData): string[] {
  const out: string[] = [];
  const keys = ["version", "name", "id", "width", "height", "tileWidth", "tileHeight"] as const;
  for (const k of keys) if (before[k] !== after[k]) out.push(`${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
  if (!same(before.tilesets, after.tilesets)) out.push("tilesets가 다르다");
  if (before.layers.length !== after.layers.length) out.push(`레이어 수: ${before.layers.length} → ${after.layers.length}`);
  const n = Math.min(before.layers.length, after.layers.length);
  for (let i = 0; i < n; i++) {
    const a = before.layers[i];
    const b = after.layers[i];
    if (a.name !== b.name) out.push(`layers[${i}].name: ${a.name} → ${b.name}`);
    if (!same(a.extra, b.extra)) out.push(`layers[${i}]의 다른 키가 다르다`);
    if (a.data.length !== b.data.length) out.push(`layers[${i}].data 길이: ${a.data.length} → ${b.data.length}`);
  }
  if ((before.collision === null) !== (after.collision === null)) out.push(`collision: ${before.collision ? "있음" : "없음"} → ${after.collision ? "있음" : "없음"}`);
  else if (before.collision && after.collision && before.collision.length !== after.collision.length) out.push(`collision 길이: ${before.collision.length} → ${after.collision.length}`);
  if (!same(before.events, after.events)) out.push("events가 다르다");
  if (!same(before.extra, after.extra)) out.push("최상위의 다른 키가 다르다");
  return out;
}

function diffData(layer: number | "collision", a: readonly number[], b: readonly number[], width: number, out: CellEdit[]): void {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) out.push({ layer, index: i, x: i % width, y: Math.floor(i / width), before: a[i], after: b[i] });
  }
}

/** 레이어 순서, 칸 순서로 바뀐 칸 (통행은 맨 뒤) */
export function cellEdits(before: MapData, after: MapData): CellEdit[] {
  const out: CellEdit[] = [];
  const n = Math.min(before.layers.length, after.layers.length);
  for (let i = 0; i < n; i++) diffData(i, before.layers[i].data, after.layers[i].data, before.width, out);
  if (before.collision && after.collision) diffData("collision", before.collision, after.collision, before.width, out);
  return out;
}

/** 오브젝트 한 개의 칸을 평평하게: x, y, width, height, props.<이름>, extra.<이름> */
function flatten(o: MapObject): Map<string, unknown> {
  const out = new Map<string, unknown>([
    ["type", o.type],
    ["x", o.x],
    ["y", o.y],
  ]);
  if (o.width !== undefined) out.set("width", o.width);
  if (o.height !== undefined) out.set("height", o.height);
  for (const [k, v] of Object.entries(o.props)) out.set(`props.${k}`, v);
  for (const [k, v] of Object.entries(o.extra)) out.set(`extra.${k}`, v);
  return out;
}

/** id로 맞춘 차이. 순서가 바뀌었으면 order 한 건, 바뀐 칸은 경로 이름순 */
export function objectEdits(before: readonly MapObject[], after: readonly MapObject[]): ObjectEdit[] {
  const out: ObjectEdit[] = [];
  const afterById = new Map(after.map((o) => [o.id, o]));
  const beforeIds = new Set(before.map((o) => o.id));
  for (const o of before) if (!afterById.has(o.id)) out.push({ kind: "removed", id: o.id });
  for (const o of after) if (!beforeIds.has(o.id)) out.push({ kind: "added", id: o.id });
  const keptBefore = before.map((o) => o.id).filter((id) => afterById.has(id));
  const keptAfter = after.map((o) => o.id).filter((id) => beforeIds.has(id));
  if (!same(keptBefore, keptAfter)) out.push({ kind: "order", before: keptBefore, after: keptAfter });
  for (const a of before) {
    const b = afterById.get(a.id);
    if (!b) continue;
    const fa = flatten(a);
    const fb = flatten(b);
    const paths = [...new Set([...fa.keys(), ...fb.keys()])].sort();
    const changes = paths.filter((p) => !same(fa.get(p), fb.get(p))).map((p) => ({ path: p, before: fa.get(p), after: fb.get(p) }));
    if (changes.length > 0) out.push({ kind: "changed", id: a.id, changes });
  }
  return out;
}
