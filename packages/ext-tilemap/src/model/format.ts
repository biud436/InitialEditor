// 맵 파일 (엔진 맵 포맷 v1/v2, docs/plans/04-extensions-and-tilemap.md 4절, 엔진 docs/plans/02-tilemap.md).
//
// 에디터는 v1 과 v2 를 읽고 늘 v2 로 쓴다. 엔진의 C++ 로더는 필요한 키(크기, 타일셋, 레이어, collision)만
// 읽고 나머지는 무시하므로, 에디터와 스크립트만 아는 키(events, objects)를 실어 나를 수 있다.
//
//   events  : 섹션: 확장이 맡는다 (RPG 이벤트, docs/plans/e5-rpg.md 2.2). 타일맵은 해석하지 않고 고정 형식의 키 자리만 지킨다.
//             null 은 없는 키이고, 빈 {} 는 엔진에게 빈 배열이라 [] 로 읽고 쓴다 (엔진 M2 3.1)
//   그 밖의 모르는 최상위 키도 확장이 섹션으로 맡을 수 있다 (MapModel.rawSection, MapDocument 의 레이어 상태)
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
  /** 섹션 events (확장이 맡는다, 타일맵은 보존만). null 이면 키가 없다 (파일의 "events": null 도 같다) */
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
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw new MapFormatError(`${where}.${key}: ${min} 이상의 정수여야 함`, `${where}.${key}`);
  return v;
}

function numberArray(v: unknown, length: number, where: string): number[] {
  if (!Array.isArray(v)) throw new MapFormatError(`${where}: 배열이어야 함`, where);
  if (v.length !== length) throw new MapFormatError(`${where} 길이는 ${length}여야 함 (현재: ${v.length})`, where);
  for (let i = 0; i < v.length; i++) {
    const n = v[i];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new MapFormatError(`${where}[${i}]: 0 이상의 정수여야 함`, `${where}[${i}]`);
  }
  return v as number[];
}

// ---- 2^53 을 넘는 정수 ----
//
// JSON.parse 는 안전한 범위 밖의 정수(12345678901234567890)를 가까운 실수로 바꿔 저장하면 다른 숫자가 된다. 엔진은 64비트 정수로
// 읽으므로(엔진 47e4fca) 손대지 않은 이벤트의 data 같은 값이 저장만으로 바뀌면 안 된다. 그래서 읽을 때 그런 정수를 원래 글을 든
// 표식 글("\u0000INT:<숫자>\u0000")로 싣고, 쓸 때 표식을 벗겨 숫자 그대로 쓴다. 표식은 글이라 사본(JSON 왕복)과 되돌리기를
// 지나도 그대로다. 파일에서는 수이므로 값을 보는 쪽은 아래의 isJsonNumber, isJsonText, jsonValueText로 수로 다룬다:
// 검사는 수로, 보이기는 숫자로, 사본 글(클립보드)은 stringifyJsonLossless로 숫자 그대로 쓴다.
// 맵의 크기와 타일 배열처럼 칸 수를 적는 자리는 그대로 수만 받는다 (그런 값이 올 일이 없다).

const BIG_INT_MARK = "\u0000INT:";
const BIG_INT_END = "\u0000";
/** JSON.stringify 가 쓴 표식 글 (NUL 은 \u0000 여섯 글자로 나온다) */
const BIG_INT_JSON = /(?<!\\)"\\u0000INT:(-?\d+)\\u0000"/g;

/** 표식 글이면 원래 숫자 글, 아니면 null */
export function bigIntText(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith(BIG_INT_MARK) || !v.endsWith(BIG_INT_END)) return null;
  const digits = v.slice(BIG_INT_MARK.length, v.length - BIG_INT_END.length);
  return /^-?\d+$/.test(digits) ? digits : null;
}

/** 숫자 글을 표식 글로 (테스트와 JSON 칸이 쓴다) */
export function bigIntValue(digits: string): string {
  return `${BIG_INT_MARK}${digits}${BIG_INT_END}`;
}

/** 수로 다시 쓰면 글이 바뀌는 정수 토큰(16자리 이상)을 표식 글로 바꾼 JSON 글. 글 안의 숫자는 건드리지 않는다 */
function markBigInts(text: string): string {
  const token = /-?\d+(\.\d+)?([eE][+-]?\d+)?/y;
  let out = "";
  let last = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      for (i++; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      i++;
      continue;
    }
    if (c === "-" || (c >= "0" && c <= "9")) {
      token.lastIndex = i;
      const m = token.exec(text);
      if (m) {
        const tok = m[0];
        if (!m[1] && !m[2] && /\d{16}/.test(tok) && String(Number(tok)) !== tok) {
          out += text.slice(last, i) + JSON.stringify(bigIntValue(tok));
          last = i + tok.length;
        }
        i += tok.length;
        continue;
      }
    }
    i++;
  }
  return last === 0 ? text : out + text.slice(last);
}

/** JSON.parse 와 같되 2^53 을 넘는 정수는 표식 글로 싣는다 (stringifyJsonLossless 가 숫자 그대로 쓴다) */
export function parseJsonLossless(text: string): unknown {
  return JSON.parse(/\d{16}/.test(text) ? markBigInts(text) : text);
}

/** JSON.stringify 와 같되 표식 글은 숫자 그대로 쓴다 */
export function stringifyJsonLossless(value: unknown, space?: number): string {
  const text = JSON.stringify(value, null, space);
  return text === undefined ? text : text.replace(BIG_INT_JSON, "$1");
}

/** JSON의 수인가 (표식 글로 실은 큰 정수도 수다) */
export function isJsonNumber(v: unknown): boolean {
  return (typeof v === "number" && Number.isFinite(v)) || bigIntText(v) !== null;
}

/** JSON의 정수인가 (2.0도 정수다. 표식 글은 늘 정수다) */
export function isJsonInteger(v: unknown): boolean {
  return (typeof v === "number" && Number.isInteger(v)) || bigIntText(v) !== null;
}

/** 수의 값. 표식 글은 가장 가까운 수다 (크기 견주기에만 쓴다). 수가 아니면 undefined */
export function jsonNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const digits = bigIntText(v);
  return digits === null ? undefined : Number(digits);
}

/** JSON의 글인가 (표식 글은 수라 글이 아니다) */
export function isJsonText(v: unknown): v is string {
  return typeof v === "string" && bigIntText(v) === null;
}

/** 값을 보일 글: 글은 그대로, 표식 글은 숫자, 그 밖은 JSON (그 안의 표식도 숫자로) */
export function jsonValueText(v: unknown): string {
  if (typeof v === "string") return bigIntText(v) ?? v;
  const text = stringifyJsonLossless(v);
  return text === undefined ? String(v) : text;
}

/**
 * 입력 칸에 적은 수를 값으로: 수로 바꾸면 글이 바뀌는 16자리 이상의 정수는 표식 글(숫자 그대로), 그 밖은 수.
 * 수가 아니면 null. 정수의 앞의 0은 뗀다
 */
export function numberFromText(text: string): number | string | null {
  const t = text.trim();
  if (t === "") return null;
  if (/^-?\d+$/.test(t)) {
    const digits = t.replace(/^(-?)0+(?=\d)/, "$1");
    if (/\d{16}/.test(digits) && String(Number(digits)) !== digits) return bigIntValue(digits);
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseMap(text: string): MapData {
  let raw: unknown;
  try {
    raw = parseJsonLossless(text);
  } catch (e) {
    throw new MapFormatError(`JSON 구문 오류: ${(e as Error).message}`);
  }
  if (!isRecord(raw)) throw new MapFormatError("맵 파일 최상위 값은 객체여야 함");
  const version = raw.version;
  if (!SUPPORTED_MAP_VERSIONS.includes(version as 1 | 2)) throw new MapFormatError(`지원하지 않는 맵 버전: ${String(version)} (지원: 1, 2)`, "version");
  const width = int(raw, "width", "map", 1);
  const height = int(raw, "height", "map", 1);
  const tileWidth = int(raw, "tileWidth", "map", 1);
  const tileHeight = int(raw, "tileHeight", "map", 1);
  const cells = width * height;
  if (!Array.isArray(raw.tilesets)) throw new MapFormatError("tilesets는 배열이어야 함", "tilesets");
  const tilesets = raw.tilesets.map((t, i) => {
    const where = `tilesets[${i}]`;
    if (!isRecord(t)) throw new MapFormatError(`${where}: 객체여야 함`, where);
    if (!isJsonText(t.image) || t.image === "") throw new MapFormatError(`${where}.image 없음`, `${where}.image`);
    return { image: t.image, firstGid: int(t, "firstGid", where, 1), columns: int(t, "columns", where, 1), extra: extraOf(t, TILESET_KEYS) };
  });
  if (!Array.isArray(raw.layers)) throw new MapFormatError("layers는 배열이어야 함", "layers");
  const layers = raw.layers.map((l, i) => {
    const where = `layers[${i}]`;
    if (!isRecord(l)) throw new MapFormatError(`${where}: 객체여야 함`, where);
    return { name: isJsonText(l.name) ? l.name : `layer${i + 1}`, data: [...numberArray(l.data, cells, `${where}.data`)], extra: extraOf(l, LAYER_KEYS) };
  });
  const collision = raw.collision === undefined || raw.collision === null ? null : [...numberArray(raw.collision, cells, "collision")];
  const events = eventsOf(raw.events);
  let objects: MapObject[] = [];
  if (raw.objects !== undefined) {
    if (!Array.isArray(raw.objects)) throw new MapFormatError("objects는 배열이어야 함", "objects");
    objects = raw.objects.map((o, i) => parseObject(o, i));
  }
  return {
    version: version as number,
    name: isJsonText(raw.name) ? raw.name : "",
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

/**
 * events 자리의 값 (엔진 M2 3.1). null 은 없는 키라 null 이다 (저장할 때 키를 쓰지 않는다, mapfile.py 와 같다).
 * 값이 전부 null 인 객체(빈 {} 포함)는 엔진의 Json.Load 에게 빈 표, 곧 빈 배열이라 [] 로 읽는다 (저장할 때 [] 로 쓴다).
 * 그 밖의 배열 아닌 값은 틀린 파일이다
 */
function eventsOf(v: unknown): unknown[] | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v;
  if (isRecord(v) && Object.values(v).every((x) => x === null)) return [];
  throw new MapFormatError("events는 배열이어야 함", "events");
}

function parseObject(o: unknown, i: number): MapObject {
  const where = `objects[${i}]`;
  if (!isRecord(o)) throw new MapFormatError(`${where}: 객체여야 함`, where);
  // 표식 글로 실은 큰 정수는 파일에서 수라 글 자리(id, type)에 올 수 없다
  if (!isJsonText(o.id) || o.id === "") throw new MapFormatError(`${where}.id는 비어 있지 않은 문자열이어야 함`, `${where}.id`);
  if (!isJsonText(o.type) || o.type === "") throw new MapFormatError(`${where}.type 없음`, `${where}.type`);
  const num = (key: string, required: boolean): number | undefined => {
    const v = o[key];
    if (v === undefined) {
      if (required) throw new MapFormatError(`${where}.${key} 없음`, `${where}.${key}`);
      return undefined;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) throw new MapFormatError(`${where}.${key}: 숫자여야 함`, `${where}.${key}`);
    return v;
  };
  if (o.props !== undefined && !isRecord(o.props)) throw new MapFormatError(`${where}.props는 객체여야 함`, `${where}.props`);
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

  const text = stringifyJsonLossless(out, 2);
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
