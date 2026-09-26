// 맵 오브젝트 편집의 순수 규칙. DOM, MobX, 에디터를 모르므로 Node에서 테스트한다 (rules.test.ts).
//   - 목록 묶음: 스키마의 타입 순서대로, 스키마에 없는 타입은 맨 뒤 한 묶음
//   - 한 줄 요약: 첫 enum 칸의 값, 띠는 x..x+width, 사각형은 크기
//   - 새 오브젝트: unique 타입 거부, defaultProps, 띠와 사각형의 기본 크기, 겹치지 않는 id
//   - 복제: 새 id, 16px 옆, unique 타입은 건너뛴다
//   - 여기서 실행의 위치와 환경 변수

import {
  cloneObject,
  defaultProps,
  playEnv,
  typeOf,
  uniqueMapObjectId,
  type FieldSpec,
  type MapObject,
  type MapObjectSchema,
  type ObjectTypeSchema,
} from "@initial-editor/ext-tilemap/model";

export const UNKNOWN_GROUP_LABEL = "스키마에 없음";
/** 띠와 사각형 타입에 defaultWidth/defaultHeight가 없을 때 쓰는 칸 수 */
export const FALLBACK_SIZE_TILES = 2;
export const DUPLICATE_OFFSET = 16;
export const PATROL_RADIUS = 64;

export interface Point {
  x: number;
  y: number;
}

export interface ObjectGroup {
  type: string;
  label: string;
  /** 스키마에 없는 타입 묶음이면 undefined */
  spec?: ObjectTypeSchema;
  objects: MapObject[];
}

/** 스키마 타입 순서의 묶음. 오브젝트가 없는 스키마 타입도 빈 묶음으로 넣는다 (추가 버튼 자리) */
export function groupObjects(objects: readonly MapObject[], schema: MapObjectSchema | null): ObjectGroup[] {
  const groups: ObjectGroup[] = (schema?.types ?? []).map((spec) => ({ type: spec.type, label: spec.label, spec, objects: [] }));
  const byType = new Map(groups.map((g) => [g.type, g]));
  const unknown: MapObject[] = [];
  for (const o of objects) {
    const g = byType.get(o.type);
    if (g) g.objects.push(o);
    else unknown.push(o);
  }
  if (unknown.length > 0) groups.push({ type: "", label: UNKNOWN_GROUP_LABEL, objects: unknown });
  return groups;
}

/** 목록 한 줄의 요약. 띠는 x..x+width, 사각형은 x,y wxh, 그 밖은 첫 enum 칸의 값 */
export function summarizeObject(o: MapObject, spec: ObjectTypeSchema | undefined): string {
  const parts: string[] = [];
  const firstEnum = spec?.fields.find((f) => f.type === "enum");
  if (firstEnum && o.props[firstEnum.name] !== undefined) parts.push(String(o.props[firstEnum.name]));
  const shape = spec?.shape ?? (o.width !== undefined ? "band" : "point");
  if (shape === "band") parts.push(`${o.x}..${o.x + (o.width ?? 0)}`);
  else if (shape === "rect") parts.push(`${o.x},${o.y} ${o.width ?? 0}x${o.height ?? 0}`);
  else if (!firstEnum) parts.push(`${o.x}, ${o.y}`);
  return parts.join(" ");
}

export interface MapGeometry {
  pixelWidth: number;
  pixelHeight: number;
  tileWidth: number;
  tileHeight: number;
}

export type AddPlan = { ok: true; object: MapObject } | { ok: false; reason: string };

/** 새 오브젝트 한 개를 만든다 (명령은 만들지 않는다). at은 점이면 그 자리, 띠와 사각형이면 가운데 */
export function planNewObject(schema: MapObjectSchema | null, type: string, objects: readonly MapObject[], at: Point, geometry: MapGeometry): AddPlan {
  const spec = typeOf(schema, type);
  if (!spec) return { ok: false, reason: `스키마에 없는 타입이다: ${type}` };
  if (spec.unique && objects.some((o) => o.type === type)) return { ok: false, reason: `${spec.label} 은(는) 하나만 둘 수 있다` };
  const id = uniqueMapObjectId(type, objects.map((o) => o.id));
  const obj: MapObject = { id, type, x: Math.round(at.x), y: Math.round(at.y), props: defaultProps(spec), extra: {} };
  if (spec.shape === "band" || spec.shape === "rect") {
    const width = spec.defaultWidth ?? geometry.tileWidth * FALLBACK_SIZE_TILES;
    obj.width = width;
    obj.x = clamp(Math.round(at.x - width / 2), 0, Math.max(0, geometry.pixelWidth - width));
    if (spec.shape === "rect") {
      const height = spec.defaultHeight ?? geometry.tileHeight * FALLBACK_SIZE_TILES;
      obj.height = height;
      obj.y = clamp(Math.round(at.y - height / 2), 0, Math.max(0, geometry.pixelHeight - height));
    } else {
      obj.y = 0;
    }
  }
  return { ok: true, object: obj };
}

export interface DuplicatePlan {
  copies: Array<{ object: MapObject; after: string }>;
  /** unique 타입이라 건너뛴 id */
  skipped: string[];
}

/** 고른 오브젝트의 복제본. 원본 바로 뒤에 놓을 수 있게 after에 원본 id를 둔다 */
export function planDuplicate(schema: MapObjectSchema | null, objects: readonly MapObject[], ids: readonly string[]): DuplicatePlan {
  const taken = new Set(objects.map((o) => o.id));
  const copies: DuplicatePlan["copies"] = [];
  const skipped: string[] = [];
  for (const o of objects) {
    if (!ids.includes(o.id)) continue;
    if (typeOf(schema, o.type)?.unique) {
      skipped.push(o.id);
      continue;
    }
    const id = uniqueMapObjectId(o.id.replace(/_\d+$/, "") || o.type, taken);
    taken.add(id);
    copies.push({ object: { ...cloneObject(o), id, x: o.x + DUPLICATE_OFFSET }, after: o.id });
  }
  return { copies, skipped };
}

/** 이름 바꾸기 검사. 쓸 수 없으면 이유 */
export function validateRename(id: string, next: string, taken: readonly string[]): string | null {
  const v = next.trim();
  if (v === id) return null;
  if (v === "") return "id 는 비울 수 없다";
  if (taken.includes(v)) return `이미 있는 id 다: ${v}`;
  return null;
}

/** rangeMin, rangeMax 역할의 칸 한 쌍 (둘 다 있을 때만) */
export function rangeFields(spec: ObjectTypeSchema | undefined): { min: FieldSpec; max: FieldSpec } | null {
  const min = spec?.fields.find((f) => f.role === "rangeMin");
  const max = spec?.fields.find((f) => f.role === "rangeMax");
  return min && max ? { min, max } : null;
}

/** 여러 개를 함께 고칠 수 있는 칸 (enum, boolean) */
export function bulkEditableFields(spec: ObjectTypeSchema): FieldSpec[] {
  return spec.fields.filter((f) => f.type === "enum" || f.type === "boolean");
}

// ---- 여기서 실행 ----

export type PlaySource = "selection" | "cursor" | "view" | "start" | "center";

export const PLAY_SOURCE_LABELS: Record<PlaySource, string> = {
  selection: "선택한 오브젝트",
  cursor: "커서",
  view: "화면 가운데",
  start: "시작 지점",
  center: "맵 가운데",
};

export interface PlayPositionInput {
  objects: readonly MapObject[];
  selectedIds: readonly string[];
  cursor: Point | null | undefined;
  viewCenter: Point | null | undefined;
  geometry: MapGeometry;
  /** 시작 지점으로 볼 타입 (기본 start) */
  startType?: string;
}

export interface PlayPosition extends Point {
  source: PlaySource;
  objectId?: string;
}

function isPoint(p: Point | null | undefined): p is Point {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** 실행 위치: 하나만 고른 오브젝트, 커서, 화면 가운데, 시작 지점, 맵 가운데 순서 */
export function playPosition(input: PlayPositionInput): PlayPosition {
  if (input.selectedIds.length === 1) {
    const o = input.objects.find((x) => x.id === input.selectedIds[0]);
    if (o) return { x: Math.round(o.x), y: Math.round(o.y), source: "selection", objectId: o.id };
  }
  if (isPoint(input.cursor)) return { x: Math.round(input.cursor.x), y: Math.round(input.cursor.y), source: "cursor" };
  if (isPoint(input.viewCenter)) return { x: Math.round(input.viewCenter.x), y: Math.round(input.viewCenter.y), source: "view" };
  const start = input.objects.find((o) => o.type === (input.startType ?? "start"));
  if (start) return { x: Math.round(start.x), y: Math.round(start.y), source: "start", objectId: start.id };
  return { x: Math.round(input.geometry.pixelWidth / 2), y: Math.round(input.geometry.pixelHeight / 2), source: "center" };
}

/** 맵 이름: 파일의 name, 비었으면 파일 이름에서 .json을 뺀 것 */
export function mapNameFor(name: string, path: string | null): string {
  if (name.trim() !== "") return name;
  const file = (path ?? "").split("/").pop() ?? "";
  return file.replace(/\.json$/i, "");
}

/** play.env를 채운 실행 환경 변수. 스키마에 play가 없으면 null */
export function buildPlayEnv(schema: MapObjectSchema | null, map: { name: string; path: string | null }, at: Point): Record<string, string> | null {
  if (!schema?.play) return null;
  return playEnv(schema, { mapName: mapNameFor(map.name, map.path), mapFile: map.path ?? "", x: at.x, y: at.y });
}

export const NO_PLAY_HINT = '스키마에 play 가 없다. resources/schema/map-objects.json 에 "play": { "env": { "INITIAL2D_SCENE": "...", "변수": "{map.name}", "위치": "{x}" } } 를 더하면 켜진다';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
