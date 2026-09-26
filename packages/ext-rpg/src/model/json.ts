// JSON 모양 판정. 엔진 jsonshape.lua 의 규칙(M2 3.1)을 JSON.parse 결과에 맞춘다.
//
// 엔진의 Json.Load 는 배열과 객체를 같은 Lua 표로 만들고 null 은 칸을 비운다. 그래서
//   배열 자리  배열이면 된다. 객체는 값이 전부 null 일 때만(엔진에게는 빈 표) 빈 배열이다
//   객체 자리  객체면 된다. 배열은 끝까지 null 뿐일 때만(엔진에게는 빈 표) 빈 객체다
//   칸 수      끝의 null 을 뺀 길이. 가운데의 null 은 한 칸이다
//   키의 null  없는 키와 같다

export type JsonObject = Record<string, unknown>;

export function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/** 엔진이 보는 칸 수 (끝의 null 은 Json.Load 가 남기지 않는다) */
export function engineLength(list: readonly unknown[]): number {
  let n = list.length;
  while (n > 0 && (list[n - 1] === null || list[n - 1] === undefined)) n--;
  return n;
}

function allNull(o: JsonObject): boolean {
  return Object.values(o).every((v) => v === null || v === undefined);
}

/** 배열 자리에 놓여도 되는가 (엔진이 배열로 보는가) */
export function isArrayPlace(v: unknown): boolean {
  return Array.isArray(v) || (isPlainObject(v) && allNull(v));
}

/** 객체 자리에 놓여도 되는가 (엔진이 객체로 보는가) */
export function isObjectPlace(v: unknown): boolean {
  return isPlainObject(v) || (Array.isArray(v) && engineLength(v) === 0);
}

/** 배열 자리의 값을 배열로 (엔진이 빈 배열로 보는 객체는 빈 배열). 배열 자리가 아니면 undefined */
export function asList(v: unknown): unknown[] | undefined {
  if (Array.isArray(v)) return v;
  if (isPlainObject(v) && allNull(v)) return [];
  return undefined;
}

/** 객체의 칸. null 과 없는 키와 객체가 아닌 값은 undefined (엔진의 nil) */
export function field(o: unknown, key: string): unknown {
  if (!isPlainObject(o) || !hasOwn(o, key)) return undefined;
  const v = o[key];
  return v === null ? undefined : v;
}

/** 정수인 수 (2.0 도 정수다) */
export function isInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isNonNegInt(v: unknown): v is number {
  return isInteger(v) && v >= 0;
}

export function cloneJson<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** 키 순서와 상관없는 비교용 글 (같은 내용이면 같은 글) */
export function stableKey(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableKey).join(",")}]`;
  if (isPlainObject(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableKey(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * order 의 키를 그 순서로 앞에 두고, 나머지 키는 원래 순서대로 뒤에 둔 사본 (M2 2.6).
 * 값이 undefined 인 키는 뺀다. each 가 있으면 값마다 거친다
 */
export function ordered(o: JsonObject, order: readonly string[], each?: (key: string, value: unknown) => unknown): JsonObject {
  const out: JsonObject = {};
  const put = (k: string) => {
    const v = o[k];
    if (v === undefined) return;
    out[k] = each ? each(k, v) : v;
  };
  for (const k of order) if (hasOwn(o, k)) put(k);
  for (const k of Object.keys(o)) if (!order.includes(k)) put(k);
  return out;
}
