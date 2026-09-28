// 맵 오브젝트 편집의 순수 규칙. DOM, MobX, 에디터를 모르므로 Node에서 테스트한다 (rules.test.ts).
//   - 목록 묶음: 스키마의 타입 순서대로, 스키마에 없는 타입은 맨 뒤 한 묶음
//   - 한 줄 요약: 첫 enum 칸의 값, 띠는 x..x+width, 사각형은 크기
//   - 새 오브젝트: unique 타입 거부, defaultProps, 띠와 사각형의 기본 크기, 겹치지 않는 id,
//     범위 칸(rangeMin/rangeMax)은 스키마 기본값이 없으면 x 기준 ±PATROL_RADIUS
//   - 복제와 붙여넣기의 자리: x로만 한 칸(맵 끝이면 반대쪽), y는 그대로(바닥에 선 것이 바닥에 남는다), 순찰 범위도 같이.
//     복제는 새 id이고 unique 타입은 건너뛴다
//   - 여기서 실행의 위치(맵 안으로 자른다)와 환경 변수, play.maps가 받지 않는 맵의 이유

import {
  cloneObject,
  defaultProps,
  isBandObject,
  jsonValueText,
  playAllowsMap,
  playEnv,
  shiftObject,
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
export const PATROL_RADIUS = 64;
/** 이 맵에서 실행: 범위(rangeMin, rangeMax)가 있는 오브젝트를 선택하면 범위 최소 X에서 이만큼 왼쪽에서 시작 */
export const PLAY_RANGE_GAP = 48;
/** 여기서 실행: 순찰 범위 기준으로 정한 x의 아래 한계 */
export const PLAY_MIN_X = 16;

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
  if (firstEnum && o.props[firstEnum.name] !== undefined) parts.push(jsonValueText(o.props[firstEnum.name]));
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
  if (!spec) return { ok: false, reason: `스키마에 없는 타입: ${type}` };
  if (spec.unique && objects.some((o) => o.type === type)) return { ok: false, reason: `${spec.label}: 맵당 1개만 허용` };
  const id = uniqueMapObjectId(type, objects.map((o) => o.id));
  // 점은 맵 안에 놓는다 (뷰 가운데가 맵 밖일 수 있다)
  const obj: MapObject = {
    id,
    type,
    x: clamp(Math.round(at.x), 0, Math.max(0, geometry.pixelWidth - 1)),
    y: clamp(Math.round(at.y), 0, Math.max(0, geometry.pixelHeight - 1)),
    props: defaultProps(spec),
    extra: {},
  };
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
  const range = rangeFields(spec);
  if (range) {
    const around = rangeAround(obj.x, geometry.pixelWidth);
    if (range.min.default === undefined) obj.props[range.min.name] = around.min;
    if (range.max.default === undefined) obj.props[range.max.name] = around.max;
  }
  return { ok: true, object: obj };
}

/** x 기준 ±radius 범위. 맵 폭 안으로 자른다 (새 오브젝트와 "현재 위치 기준" 버튼이 같이 쓴다) */
export function rangeAround(x: number, pixelWidth: number, radius = PATROL_RADIUS): { min: number; max: number } {
  const cx = clamp(Math.round(x), 0, Math.max(0, pixelWidth));
  return { min: Math.max(0, Math.round(cx - radius)), max: Math.min(pixelWidth, Math.round(cx + radius)) };
}

/** 붙이기와 복제가 맵 안으로 당길 때 쓰는 맵 크기 (픽셀) */
export interface CopyBounds {
  pixelWidth: number;
  pixelHeight: number;
}

/** v를 [lo, hi]로 당긴다. 맵이 오브젝트보다 좁으면(hi < lo) lo */
function clampInside(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

/**
 * 한 축의 붙일 자리: v + d를 [lo, hi]로 당긴다. 당겨서 원래 자리 v로 돌아오면 반대쪽(v - d)을 당겨 쓴다.
 */
export function pasteAxis(v: number, d: number, lo: number, hi: number): number {
  const forward = clampInside(v + d, lo, hi);
  if (forward !== v || d === 0) return forward;
  return clampInside(v - d, lo, hi);
}

/**
 * 붙이기와 복제의 자리: x로 dx 옮기고(맵 끝에 붙어 못 가면 반대쪽), y는 두되 맵 밖이면 안으로 당긴다.
 * 옆으로만 옮기므로 바닥에 선 몬스터와 시작 지점이 바닥 속으로 들어가지 않는다. 순찰 범위 칸은 x와 함께 옮긴다.
 */
export function placeCopy(source: MapObject, spec: ObjectTypeSchema | undefined, dx: number, bounds: CopyBounds): MapObject {
  const x = pasteAxis(source.x, dx, 0, bounds.pixelWidth - (source.width ?? 1));
  const y = isBandObject(source, spec) ? source.y : clampInside(source.y, 0, bounds.pixelHeight - (source.height ?? 1));
  return shiftObject(cloneObject(source), x - source.x, y - source.y, spec);
}

export interface DuplicatePlan {
  copies: Array<{ object: MapObject; after: string }>;
  /** unique 타입이라 건너뛴 id */
  skipped: string[];
}

/** 고른 오브젝트의 복제본 (placeCopy로 dx 옆, 보통 한 칸). 원본 바로 뒤에 놓을 수 있게 after에 원본 id를 둔다 */
export function planDuplicate(schema: MapObjectSchema | null, objects: readonly MapObject[], ids: readonly string[], dx: number, bounds: CopyBounds): DuplicatePlan {
  const taken = new Set(objects.map((o) => o.id));
  const copies: DuplicatePlan["copies"] = [];
  const skipped: string[] = [];
  for (const o of objects) {
    if (!ids.includes(o.id)) continue;
    const spec = typeOf(schema, o.type);
    if (spec?.unique) {
      skipped.push(o.id);
      continue;
    }
    const id = uniqueMapObjectId(o.id.replace(/_\d+$/, "") || o.type, taken);
    taken.add(id);
    copies.push({ object: { ...placeCopy(o, spec, dx, bounds), id }, after: o.id });
  }
  return { copies, skipped };
}

/** 이름 바꾸기 검사. 쓸 수 없으면 이유 */
export function validateRename(id: string, next: string, taken: readonly string[]): string | null {
  const v = next.trim();
  if (v === id) return null;
  if (v === "") return "id 비어 있음";
  if (taken.includes(v)) return `이미 있는 id: ${v}`;
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
  /** 이 맵의 뷰에 남은 커서. 맵 밖이면 쓰지 않는다 */
  cursor: Point | null | undefined;
  viewCenter: Point | null | undefined;
  geometry: MapGeometry;
  /** 범위 칸(rangeMin)을 찾는 데 쓴다 */
  schema?: MapObjectSchema | null;
  /** 시작 지점으로 볼 타입 (기본 start) */
  startType?: string;
}

export interface PlayPosition extends Point {
  source: PlaySource;
  objectId?: string;
  /** 위치를 옮긴 이유 (기록용) */
  note?: string;
}

/** 여기서 실행의 위치 규칙 (메뉴 안내) */
export const PLAY_POSITION_RULE = `실행 위치 결정 순서: 선택한 오브젝트 1개 (범위가 있으면 최소 X에서 ${PLAY_RANGE_GAP}px 왼쪽, ${PLAY_MIN_X} 이상), 맵 안의 커서, 화면 가운데, 시작 지점, 맵 가운데. 결과 좌표는 맵 안으로 제한`;

function isPoint(p: Point | null | undefined): p is Point {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function insideMap(p: Point, g: MapGeometry): boolean {
  return p.x >= 0 && p.x < g.pixelWidth && p.y >= 0 && p.y < g.pixelHeight;
}

/**
 * 실행 위치: 하나만 고른 오브젝트, 맵 안의 커서, 화면 가운데, 시작 지점, 맵 가운데 순서. 결과는 맵 안으로 자른다.
 * 선택한 오브젝트에 범위가 있으면 범위 최소 X에서 PLAY_RANGE_GAP 왼쪽(PLAY_MIN_X 이상)에서 시작한다.
 * 최소 X 값이 없으면 엔진처럼 x - PATROL_RADIUS로 본다.
 */
export function playPosition(input: PlayPositionInput): PlayPosition {
  const g = input.geometry;
  const fit = (p: PlayPosition): PlayPosition => ({
    ...p,
    x: clamp(Math.round(p.x), 0, Math.max(0, g.pixelWidth - 1)),
    y: clamp(Math.round(p.y), 0, Math.max(0, g.pixelHeight - 1)),
  });
  if (input.selectedIds.length === 1) {
    const o = input.objects.find((x) => x.id === input.selectedIds[0]);
    const range = o ? rangeFields(typeOf(input.schema ?? null, o.type)) : null;
    if (o && range) {
      const v = o.props[range.min.name];
      const min = typeof v === "number" && Number.isFinite(v) ? v : o.x - PATROL_RADIUS;
      const x = Math.max(PLAY_MIN_X, min - PLAY_RANGE_GAP);
      return fit({ x, y: o.y, source: "selection", objectId: o.id, note: `범위 최소 X ${Math.round(min)}에서 ${PLAY_RANGE_GAP}px 왼쪽` });
    }
    if (o) return fit({ x: o.x, y: o.y, source: "selection", objectId: o.id });
  }
  if (isPoint(input.cursor) && insideMap(input.cursor, g)) return fit({ x: input.cursor.x, y: input.cursor.y, source: "cursor" });
  if (isPoint(input.viewCenter)) return fit({ x: input.viewCenter.x, y: input.viewCenter.y, source: "view" });
  const start = input.objects.find((o) => o.type === (input.startType ?? "start"));
  if (start) return fit({ x: start.x, y: start.y, source: "start", objectId: start.id });
  return fit({ x: g.pixelWidth / 2, y: g.pixelHeight / 2, source: "center" });
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

/** 스키마의 play.maps가 이 맵을 받지 않으면 그 이유. 받거나 play.maps가 없으면 null */
export function playMapRefusal(schema: MapObjectSchema | null, map: { name: string; path: string | null }): string | null {
  const play = schema?.play;
  if (!play?.maps) return null;
  const name = mapNameFor(map.name, map.path);
  if (playAllowsMap(play, name)) return null;
  const list = play.maps.length > 0 ? play.maps.join(", ") : "비어 있음";
  return `'이 맵에서 실행' 대상이 아닌 맵: ${name || "(이름 없음)"} (스키마의 play.maps: ${list})`;
}

export const NO_PLAY_HINT = '스키마에 play 없음. resources/schema/map-objects.json에 "play": { "env": { "INITIAL2D_SCENE": "...", "변수": "{map.name}", "위치": "{x}" } } 추가 시 사용 가능';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
