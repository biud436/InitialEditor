// 맵 오브젝트 스키마 (resources/schema/map-objects.json).
//
// 오브젝트 레이어의 타입과 칸은 게임이 정한다. 알데바란은 시작 지점, 체크포인트, 몬스터(종과 순찰 범위),
// 흔적(글), 구간을 둔다. 에디터는 이 파일 하나로 모양(점, 띠, 사각형)과 인스펙터 폼과 색을 만든다.
// 새 타입이 늘어도 에디터 코드는 그대로다. 엔진 쪽 테스트가 스키마와 게임 데이터(예: 몬스터 종 목록)를 대조한다.
//
// {
//   "version": 1,
//   "types": [
//     { "type": "spawn", "label": "몬스터", "shape": "point", "color": "danger",
//       "fields": [
//         { "name": "species", "type": "enum", "values": ["spider", "wolf"], "default": "spider", "label": "종" },
//         { "name": "minX", "type": "number", "role": "rangeMin", "label": "순찰 왼끝" },
//         { "name": "maxX", "type": "number", "role": "rangeMax", "label": "순찰 오른끝" },
//         { "name": "boss", "type": "boolean" } ] },
//     { "type": "start", "label": "시작 지점", "shape": "point", "unique": true },
//     { "type": "landmark", "label": "흔적", "shape": "band", "defaultWidth": 48,
//       "fields": [ { "name": "text", "type": "text" } ] }
//   ],
//   "play": { "env": { "INITIAL2D_ALDEBARAN_STAGE": "{map.name}", "INITIAL2D_ALDEBARAN_START": "{x},{y}" },
//             "maps": ["aldebaran_*"] }
// }
//
// play.maps는 여기서 실행을 켤 맵 이름의 글롭 목록이다 (*는 아무 글자열, ?는 한 글자). 맵 이름은 {map.name}에 들어가는 값이다.
// 없으면 모든 맵에서 켜진다.

import type { MapObject } from "./format";

export const SCHEMA_PATH = "resources/schema/map-objects.json";

export type FieldType = "string" | "text" | "number" | "integer" | "boolean" | "enum";
export type ShapeKind = "point" | "band" | "rect";
/** 색은 테마 토큰 이름의 뒤쪽 (--accent, --danger, --warning, --success, --fg-muted) */
export type ShapeColor = "accent" | "danger" | "warning" | "success" | "muted";
/** 칸의 역할: 점 오브젝트의 가로 범위(순찰 등)를 맵 위의 손잡이로 그린다 */
export type FieldRole = "rangeMin" | "rangeMax";

export interface FieldSpec {
  name: string;
  type: FieldType;
  label: string;
  values?: string[];
  default?: unknown;
  required?: boolean;
  role?: FieldRole;
  min?: number;
  max?: number;
}

export interface ObjectTypeSchema {
  type: string;
  label: string;
  shape: ShapeKind;
  color: ShapeColor;
  unique: boolean;
  defaultWidth?: number;
  defaultHeight?: number;
  fields: FieldSpec[];
}

export interface PlaySpec {
  /** 값 안의 {map.name}, {map.file}, {x}, {y} 를 채운다 */
  env: Record<string, string>;
  /** 여기서 실행을 켤 맵 이름의 글롭. 없으면 모든 맵 */
  maps?: string[];
}

export interface MapObjectSchema {
  version: number;
  types: ObjectTypeSchema[];
  play: PlaySpec | null;
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

const FIELD_TYPES: FieldType[] = ["string", "text", "number", "integer", "boolean", "enum"];
const SHAPES: ShapeKind[] = ["point", "band", "rect"];
const COLORS: ShapeColor[] = ["accent", "danger", "warning", "success", "muted"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseObjectSchema(text: string): MapObjectSchema {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SchemaError(`JSON 이 아니다: ${(e as Error).message}`);
  }
  if (!isRecord(raw)) throw new SchemaError("스키마는 객체여야 한다");
  if (raw.version !== 1) throw new SchemaError(`모르는 스키마 버전: ${String(raw.version)}`);
  if (!Array.isArray(raw.types)) throw new SchemaError("types 는 배열이어야 한다");
  const seen = new Set<string>();
  const types = raw.types.map((t, i): ObjectTypeSchema => {
    if (!isRecord(t) || typeof t.type !== "string" || t.type === "") throw new SchemaError(`types[${i}].type 이 없다`);
    if (seen.has(t.type)) throw new SchemaError(`타입이 겹친다: ${t.type}`);
    seen.add(t.type);
    const shape = (t.shape ?? "point") as ShapeKind;
    if (!SHAPES.includes(shape)) throw new SchemaError(`${t.type}.shape 는 point, band, rect 중 하나다`);
    const color = (t.color ?? "accent") as ShapeColor;
    if (!COLORS.includes(color)) throw new SchemaError(`${t.type}.color 는 ${COLORS.join(", ")} 중 하나다`);
    const fields = Array.isArray(t.fields) ? t.fields.map((f, j) => parseField(f, `${t.type}.fields[${j}]`)) : [];
    const names = new Set<string>();
    for (const f of fields) {
      if (names.has(f.name)) throw new SchemaError(`${t.type} 의 칸이 겹친다: ${f.name}`);
      names.add(f.name);
    }
    return {
      type: t.type,
      label: typeof t.label === "string" ? t.label : t.type,
      shape,
      color,
      unique: t.unique === true,
      defaultWidth: typeof t.defaultWidth === "number" ? t.defaultWidth : undefined,
      defaultHeight: typeof t.defaultHeight === "number" ? t.defaultHeight : undefined,
      fields,
    };
  });
  return { version: 1, types, play: parsePlay(raw.play) };
}

/** play 칸: env가 객체일 때만 있다. maps는 비지 않은 글의 배열이어야 한다 */
function parsePlay(raw: unknown): PlaySpec | null {
  if (!isRecord(raw) || !isRecord(raw.env)) return null;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.env)) if (typeof v === "string") env[k] = v;
  if (raw.maps === undefined) return { env };
  if (!Array.isArray(raw.maps) || raw.maps.some((m) => typeof m !== "string" || m.trim() === "")) {
    throw new SchemaError("play.maps는 맵 이름 글롭(비지 않은 글)의 배열이어야 한다");
  }
  return { env, maps: raw.maps as string[] };
}

function parseField(f: unknown, where: string): FieldSpec {
  if (!isRecord(f) || typeof f.name !== "string" || f.name === "") throw new SchemaError(`${where}.name 이 없다`);
  const type = f.type as FieldType;
  if (!FIELD_TYPES.includes(type)) throw new SchemaError(`${where}.type 은 ${FIELD_TYPES.join(", ")} 중 하나다`);
  const spec: FieldSpec = { name: f.name, type, label: typeof f.label === "string" ? f.label : f.name };
  if (type === "enum") {
    if (!Array.isArray(f.values) || f.values.length === 0 || f.values.some((v) => typeof v !== "string")) throw new SchemaError(`${where}.values 는 문자열 배열이어야 한다`);
    spec.values = f.values as string[];
  }
  if (f.default !== undefined) spec.default = f.default;
  if (f.required === true) spec.required = true;
  if (f.role === "rangeMin" || f.role === "rangeMax") spec.role = f.role;
  if (typeof f.min === "number") spec.min = f.min;
  if (typeof f.max === "number") spec.max = f.max;
  return spec;
}

export function typeOf(schema: MapObjectSchema | null, type: string): ObjectTypeSchema | undefined {
  return schema?.types.find((t) => t.type === type);
}

/** 새 오브젝트의 기본 props (칸의 default, enum 은 첫 값) */
export function defaultProps(spec: ObjectTypeSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of spec.fields) {
    if (f.default !== undefined) out[f.name] = f.default;
    else if (f.type === "enum" && f.values) out[f.name] = f.values[0];
    else if (f.required) out[f.name] = f.type === "boolean" ? false : f.type === "number" || f.type === "integer" ? 0 : "";
  }
  return out;
}

export interface ObjectProblem {
  severity: "error" | "warning";
  message: string;
  /** objects[3].props.species 꼴 */
  location: string;
  objectId?: string;
}

/** 오브젝트를 스키마에 대어 본다. 스키마가 없으면 id 겹침만 본다 */
export function validateObjects(objects: readonly MapObject[], schema: MapObjectSchema | null): ObjectProblem[] {
  const problems: ObjectProblem[] = [];
  const ids = new Set<string>();
  const uniqueCount = new Map<string, number>();
  objects.forEach((o, i) => {
    const where = `objects[${i}]`;
    if (ids.has(o.id)) problems.push({ severity: "error", message: `id 가 겹친다: ${o.id}`, location: `${where}.id`, objectId: o.id });
    ids.add(o.id);
    if (!schema) return;
    const spec = typeOf(schema, o.type);
    if (!spec) {
      problems.push({ severity: "warning", message: `스키마에 없는 타입: ${o.type}`, location: `${where}.type`, objectId: o.id });
      return;
    }
    if (spec.unique) uniqueCount.set(o.type, (uniqueCount.get(o.type) ?? 0) + 1);
    if ((spec.shape === "band" || spec.shape === "rect") && !(typeof o.width === "number" && o.width > 0)) {
      problems.push({ severity: "error", message: `${spec.label} ${o.id} 에 폭이 없다`, location: `${where}.width`, objectId: o.id });
    }
    if (spec.shape === "rect" && !(typeof o.height === "number" && o.height > 0)) {
      problems.push({ severity: "error", message: `${spec.label} ${o.id} 에 높이가 없다`, location: `${where}.height`, objectId: o.id });
    }
    for (const f of spec.fields) {
      const v = o.props[f.name];
      const loc = `${where}.props.${f.name}`;
      // 글 칸은 비었거나 공백뿐이어도 빈 것이다 (새 오브젝트의 필수 글 칸은 ""로 시작한다)
      const blankText = (f.type === "string" || f.type === "text") && typeof v === "string" && v.trim() === "";
      if (v === undefined || blankText) {
        if (f.required) problems.push({ severity: "error", message: `${o.id}: ${f.label}이(가) 비어 있다`, location: loc, objectId: o.id });
        continue;
      }
      const bad = (why: string) => problems.push({ severity: "error", message: `${o.id}: ${f.label} ${why}`, location: loc, objectId: o.id });
      switch (f.type) {
        case "string":
        case "text":
          if (typeof v !== "string") bad("은(는) 글이어야 한다");
          break;
        case "number":
          if (typeof v !== "number" || !Number.isFinite(v)) bad("은(는) 숫자여야 한다");
          break;
        case "integer":
          if (typeof v !== "number" || !Number.isInteger(v)) bad("은(는) 정수여야 한다");
          break;
        case "boolean":
          if (typeof v !== "boolean") bad("은(는) 참이나 거짓이어야 한다");
          break;
        case "enum":
          if (typeof v !== "string" || !f.values!.includes(v)) bad(`의 값 ${JSON.stringify(v)} 은(는) 목록에 없다 (${f.values!.join(", ")})`);
          break;
      }
      if (typeof v === "number") {
        if (f.min !== undefined && v < f.min) bad(`은(는) ${f.min} 이상이어야 한다`);
        if (f.max !== undefined && v > f.max) bad(`은(는) ${f.max} 이하여야 한다`);
      }
    }
    const lo = spec.fields.find((f) => f.role === "rangeMin");
    const hi = spec.fields.find((f) => f.role === "rangeMax");
    if (lo && hi && typeof o.props[lo.name] === "number" && typeof o.props[hi.name] === "number") {
      const a = o.props[lo.name] as number;
      const b = o.props[hi.name] as number;
      if (a > b) problems.push({ severity: "error", message: `${o.id}: ${lo.label} 이(가) ${hi.label} 보다 크다`, location: `${where}.props.${lo.name}`, objectId: o.id });
      else if (o.x < a || o.x > b) problems.push({ severity: "warning", message: `${o.id}: 위치 ${o.x} 가 범위 ${a}..${b} 밖이다`, location: `${where}.x`, objectId: o.id });
    }
  });
  if (schema) {
    for (const [type, n] of uniqueCount) {
      if (n > 1) problems.push({ severity: "error", message: `${typeOf(schema, type)!.label} 은(는) 하나만 둘 수 있다 (${n}개)`, location: "objects" });
    }
  }
  return problems;
}

/** play.env 의 자리표시자를 채운다 */
export function playEnv(schema: MapObjectSchema | null, vars: { mapName: string; mapFile: string; x: number; y: number }): Record<string, string> {
  if (!schema?.play) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(schema.play.env)) {
    out[k] = v
      .replaceAll("{map.name}", vars.mapName)
      .replaceAll("{map.file}", vars.mapFile)
      .replaceAll("{x}", String(Math.round(vars.x)))
      .replaceAll("{y}", String(Math.round(vars.y)));
  }
  return out;
}

/** 맵 이름이 글롭에 맞는가. * 는 아무 글자열(빈 것도), ? 는 한 글자, 나머지는 그대로 (대소문자를 가린다) */
export function matchesMapGlob(pattern: string, name: string): boolean {
  const source = [...pattern].map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  return new RegExp(`^${source}$`, "su").test(name);
}

/** 이 맵에서 여기서 실행을 켜는가. play가 없으면 false, play.maps가 없으면 모든 맵 */
export function playAllowsMap(play: PlaySpec | null | undefined, mapName: string): boolean {
  if (!play) return false;
  if (!play.maps) return true;
  return play.maps.some((p) => matchesMapGlob(p, mapName));
}
