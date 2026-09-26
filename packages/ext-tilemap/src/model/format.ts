// 맵 파일 (엔진 맵 포맷 v1/v2, docs/plans/04-extensions-and-tilemap.md 4절, 엔진 docs/plans/02-tilemap.md).
//
// 에디터는 v1 과 v2 를 읽고 늘 v2 로 쓴다. 엔진의 C++ 로더는 필요한 키(크기, 타일셋, 레이어, collision)만
// 읽고 나머지는 무시하므로, 에디터와 스크립트만 아는 키(events, objects)를 실어 나를 수 있다.
//
//   events  : RPG 이벤트 (칸 좌표, 커맨드 목록). 9단계의 것이며 에디터는 보존만 한다 (E5 가 편집)
//   objects : 오브젝트 레이어 (픽셀 좌표, 타입과 속성). 게임이 정하는 배치 데이터 (시작 지점, 적, 흔적 등).
//             타입과 칸은 프로젝트의 resources/schema/map-objects.json 이 정한다 (schema.ts)
//
// 규칙: 모르는 키는 어디서든 보존한다. 저장 형식은 고정이다 (canonical): 2칸 들여쓰기 JSON 이고,
// 타일 배열(layers[].data, collision)은 맵 한 줄을 한 줄에 쓴다. 그래야 git diff 가 칸 단위로 읽힌다.
// 엔진의 맵 생성기(tools/generate_aldebaran_maps.py 등)도 같은 형식으로 쓴다.

export const MAP_VERSION_WRITTEN = 2;
export const SUPPORTED_MAP_VERSIONS = [1, 2] as const;

export interface Tileset {
  /** 프로젝트 루트 기준 경로 */
  image: string;
  firstGid: number;
  columns: number;
  extra: Record<string, unknown>;
}

export interface TileLayer {
  name: string;
  /** 행 우선 gid 배열 (0 은 빈 칸), 길이 width * height */
  data: number[];
  extra: Record<string, unknown>;
}

export interface MapObject {
  id: string;
  type: string;
  x: number;
  y: number;
  /** 띠나 사각형 모양일 때 (픽셀) */
  width?: number;
  height?: number;
  props: Record<string, unknown>;
  extra: Record<string, unknown>;
}

export interface MapData {
  version: number;
  name: string;
  id: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: TileLayer[];
  /** 통행 (0 지나감, 그 밖은 막힘). 없으면 null */
  collision: number[] | null;
  tilesets: Tileset[];
  /** RPG 이벤트 (보존만) */
  events: unknown[] | null;
  objects: MapObject[];
  extra: Record<string, unknown>;
}

export class MapFormatError extends Error {
  constructor(message: string, public readonly location?: string) {
    super(message);
    this.name = "MapFormatError";
  }
}

const ROOT_KEYS = ["version", "name", "id", "width", "height", "tileWidth", "tileHeight", "layers", "collision", "tilesets", "events", "objects"];
const TILESET_KEYS = ["image", "firstGid", "columns"];
const LAYER_KEYS = ["name", "data"];
const OBJECT_KEYS = ["id", "type", "x", "y", "width", "height", "props"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extraOf(o: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!known.includes(k)) out[k] = v;
  return out;
}

function int(o: Record<string, unknown>, key: string, where: string, min = 0): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw new MapFormatError(`${where}.${key} 는 ${min} 이상의 정수여야 한다`, `${where}.${key}`);
  return v;
}

function numberArray(v: unknown, length: number, where: string): number[] {
  if (!Array.isArray(v)) throw new MapFormatError(`${where} 는 배열이어야 한다`, where);
  if (v.length !== length) throw new MapFormatError(`${where} 의 길이가 ${v.length} 이다 (${length} 이어야 한다)`, where);
  for (let i = 0; i < v.length; i++) {
    const n = v[i];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new MapFormatError(`${where}[${i}] 는 0 이상의 정수여야 한다`, `${where}[${i}]`);
  }
  return v as number[];
}

export function parseMap(text: string): MapData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new MapFormatError(`JSON 이 아니다: ${(e as Error).message}`);
  }
  if (!isRecord(raw)) throw new MapFormatError("맵 파일은 객체여야 한다");
  const version = raw.version;
  if (!SUPPORTED_MAP_VERSIONS.includes(version as 1 | 2)) throw new MapFormatError(`모르는 맵 버전이다: ${String(version)} (지원: 1, 2)`, "version");
  const width = int(raw, "width", "map", 1);
  const height = int(raw, "height", "map", 1);
  const tileWidth = int(raw, "tileWidth", "map", 1);
  const tileHeight = int(raw, "tileHeight", "map", 1);
  const cells = width * height;
  if (!Array.isArray(raw.tilesets)) throw new MapFormatError("tilesets 는 배열이어야 한다", "tilesets");
  const tilesets = raw.tilesets.map((t, i) => {
    const where = `tilesets[${i}]`;
    if (!isRecord(t)) throw new MapFormatError(`${where} 는 객체여야 한다`, where);
    if (typeof t.image !== "string" || t.image === "") throw new MapFormatError(`${where}.image 가 없다`, `${where}.image`);
    return { image: t.image, firstGid: int(t, "firstGid", where, 1), columns: int(t, "columns", where, 1), extra: extraOf(t, TILESET_KEYS) };
  });
  if (!Array.isArray(raw.layers)) throw new MapFormatError("layers 는 배열이어야 한다", "layers");
  const layers = raw.layers.map((l, i) => {
    const where = `layers[${i}]`;
    if (!isRecord(l)) throw new MapFormatError(`${where} 는 객체여야 한다`, where);
    return { name: typeof l.name === "string" ? l.name : `layer${i + 1}`, data: [...numberArray(l.data, cells, `${where}.data`)], extra: extraOf(l, LAYER_KEYS) };
  });
  const collision = raw.collision === undefined || raw.collision === null ? null : [...numberArray(raw.collision, cells, "collision")];
  let events: unknown[] | null = null;
  if (raw.events !== undefined) {
    if (!Array.isArray(raw.events)) throw new MapFormatError("events 는 배열이어야 한다", "events");
    events = raw.events;
  }
  let objects: MapObject[] = [];
  if (raw.objects !== undefined) {
    if (!Array.isArray(raw.objects)) throw new MapFormatError("objects 는 배열이어야 한다", "objects");
    objects = raw.objects.map((o, i) => parseObject(o, i));
  }
  return {
    version: version as number,
    name: typeof raw.name === "string" ? raw.name : "",
    id: typeof raw.id === "number" ? raw.id : 0,
    width,
    height,
    tileWidth,
    tileHeight,
    layers,
    collision,
    tilesets,
    events,
    objects,
    extra: extraOf(raw, ROOT_KEYS),
  };
}

function parseObject(o: unknown, i: number): MapObject {
  const where = `objects[${i}]`;
  if (!isRecord(o)) throw new MapFormatError(`${where} 는 객체여야 한다`, where);
  if (typeof o.id !== "string" || o.id === "") throw new MapFormatError(`${where}.id 는 비어 있지 않은 문자열이어야 한다`, `${where}.id`);
  if (typeof o.type !== "string" || o.type === "") throw new MapFormatError(`${where}.type 이 없다`, `${where}.type`);
  const num = (key: string, required: boolean): number | undefined => {
    const v = o[key];
    if (v === undefined) {
      if (required) throw new MapFormatError(`${where}.${key} 가 없다`, `${where}.${key}`);
      return undefined;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) throw new MapFormatError(`${where}.${key} 는 숫자여야 한다`, `${where}.${key}`);
    return v;
  };
  if (o.props !== undefined && !isRecord(o.props)) throw new MapFormatError(`${where}.props 는 객체여야 한다`, `${where}.props`);
  const obj: MapObject = {
    id: o.id,
    type: o.type,
    x: num("x", true)!,
    y: num("y", false) ?? 0,
    props: { ...((o.props as Record<string, unknown>) ?? {}) },
    extra: extraOf(o, OBJECT_KEYS),
  };
  const w = num("width", false);
  const h = num("height", false);
  if (w !== undefined) obj.width = w;
  if (h !== undefined) obj.height = h;
  return obj;
}

// ---- 저장 (canonical) ----

/** 타일 배열을 행 단위로 쓰기 위한 자리표시자 */
const ROWS_MARK = "\u0000ROWS:";

function rowsMarker(id: number): string {
  return `${ROWS_MARK}${id}\u0000`;
}

export function serializeMap(map: MapData): string {
  const rows: number[][] = [];
  const mark = (data: number[]) => {
    rows.push(data);
    return rowsMarker(rows.length - 1);
  };
  const out: Record<string, unknown> = {
    version: MAP_VERSION_WRITTEN,
    name: map.name,
    id: map.id,
    width: map.width,
    height: map.height,
    tileWidth: map.tileWidth,
    tileHeight: map.tileHeight,
    layers: map.layers.map((l) => ({ name: l.name, data: mark(l.data), ...without(l.extra, LAYER_KEYS) })),
  };
  if (map.collision) out.collision = mark(map.collision);
  out.tilesets = map.tilesets.map((t) => ({ image: t.image, firstGid: t.firstGid, columns: t.columns, ...without(t.extra, TILESET_KEYS) }));
  if (map.events) out.events = map.events;
  if (map.objects.length > 0) out.objects = map.objects.map(serializeObject);
  Object.assign(out, without(map.extra, ROOT_KEYS));

  const text = JSON.stringify(out, null, 2);
  // JSON.stringify 는 자리표시자의 NUL 을 \u0000 으로 쓴다. 그 줄을 "키: [ 행들 ]" 로 바꾼다
  const re = /^( *)(.*?)"\\u0000ROWS:(\d+)\\u0000"(,?)$/gm;
  return (
    text.replace(re, (_whole, indent: string, prefix: string, idx: string, comma: string) => {
      return `${indent}${prefix}${formatRows(rows[Number(idx)], map.width, indent)}${comma}`;
    }) + "\n"
  );
}

/** 타일 배열 하나를 맵 한 줄씩 쓴다. keyIndent 는 키가 있는 줄의 들여쓰기 */
function formatRows(data: number[], width: number, keyIndent: string): string {
  const inner = keyIndent + "  ";
  const lines: string[] = [];
  for (let y = 0; y * width < data.length; y++) {
    lines.push(inner + data.slice(y * width, (y + 1) * width).join(","));
  }
  return "[\n" + lines.join(",\n") + "\n" + keyIndent + "]";
}

function serializeObject(o: MapObject): Record<string, unknown> {
  const out: Record<string, unknown> = { id: o.id, type: o.type, x: o.x, y: o.y };
  if (o.width !== undefined) out.width = o.width;
  if (o.height !== undefined) out.height = o.height;
  if (Object.keys(o.props).length > 0) out.props = o.props;
  Object.assign(out, without(o.extra, OBJECT_KEYS));
  return out;
}

function without(o: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!keys.includes(k)) out[k] = v;
  return out;
}

export function cloneMap(map: MapData): MapData {
  return {
    ...map,
    layers: map.layers.map((l) => ({ ...l, data: [...l.data], extra: { ...l.extra } })),
    collision: map.collision ? [...map.collision] : null,
    tilesets: map.tilesets.map((t) => ({ ...t, extra: { ...t.extra } })),
    events: map.events ? structuredCloneJson(map.events) : null,
    objects: map.objects.map(cloneObject),
    extra: { ...map.extra },
  };
}

export function cloneObject(o: MapObject): MapObject {
  return { ...o, props: structuredCloneJson(o.props), extra: { ...o.extra } };
}

export function structuredCloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
