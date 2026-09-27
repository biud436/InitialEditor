// 맵 파일의 events 섹션 (엔진 M2 2.6, 3.1).
//
// 섹션은 맵 파일 JSON 의 값을 그대로 든다. 이벤트 하나하나는 해석하지 않은 JSON 이고, 모르는 키와 틀린 값도
// 지우지 않는다. 고치는 길은 명령(commands.ts)뿐이고, 명령은 새 배열을 넣는다 (손대지 않은 이벤트는 같은 객체라
// 바이트가 그대로다). 고친 객체와 새 객체는 정해진 키 순서로 쓴다:
//
//   이벤트          event.fields 순서 (id, x, y, dir, trigger, charset, through, solid, speed, wander, commands)
//   커맨드          code, 그 커맨드의 args 순서, lists 순서
//   조건            판정하는 꼴의 args 순서
//   외형과 얼굴     set 또는 file, index
//   배회            minWait, maxWait, area
//   구역            x, y, w, h
//
// 스키마에 없는 키는 정해진 키 뒤에 원래 순서대로 둔다. 이전 도구(tools/export_events.lua)도 같은 표를 쓴다.
//
// 정수처럼 생긴 키("2", "10")는 예외다. JS 객체는 그런 키를 늘 맨 앞에 오름차순으로 두고, 맵의 고정 형식(엔진
// tools/mapfile.py 의 _js_keys)도 같은 규칙으로 쓴다. 그래서
//   고정 형식의 파일      그런 키가 이미 맨 앞에 있다. 손대지 않은 이벤트는 바이트가 그대로다
//   형식에 맞지 않는 파일  그런 키가 뒤에 있으면 손대지 않은 이벤트에서도 맨 앞으로 옮겨 쓴다. mapfile.py format 이 쓰는 글과 같다
//   고친 객체와 새 객체    그런 모르는 키는 정해진 키 뒤가 아니라 맨 앞이다 (역시 mapfile.py 와 같다)
// 손대지 않은 이벤트를 원래 글 조각으로 쓰지 않는 까닭은, 그러면 형식에 맞지 않는 파일에서 mapfile.py check 가 실패하는
// 글을 쓰게 되기 때문이다.

import { action, makeObservable, observable } from "mobx";
import { asList, field, hasOwn, isArrayPlace, isObjectPlace, isPlainObject, ordered, type JsonObject } from "./json";
import { commandSpec, judgedCondition, type ArgType, type EventSchema } from "./schema";

export const EVENTS_SECTION = "events";

/** 스키마에 없는 중첩 객체의 키 순서 (M2 2.6, 이전 도구와 같은 표) */
export const REF_KEYS = ["set", "file", "index"] as const;
export const WANDER_KEYS = ["minWait", "maxWait", "area"] as const;
export const AREA_KEYS = ["x", "y", "w", "h"] as const;

// ---- 키 순서 (얕게) ----

export function orderRef(ref: JsonObject): JsonObject {
  return ordered(ref, REF_KEYS);
}

export function orderArea(area: JsonObject): JsonObject {
  return ordered(area, AREA_KEYS);
}

export function orderWander(wander: JsonObject): JsonObject {
  return ordered(wander, WANDER_KEYS);
}

export function orderEvent(ev: JsonObject, schema: EventSchema): JsonObject {
  return ordered(
    ev,
    schema.fields.map((f) => f.name),
  );
}

function commandOrder(cmd: JsonObject, schema: EventSchema): string[] | null {
  const spec = commandSpec(schema, cmd.code);
  if (!spec) return null;
  return ["code", ...spec.args.map((a) => a.name), ...spec.lists.map((l) => l.name)];
}

/** 커맨드의 키 순서. 모르는 code 면 그대로 */
export function orderCommand(cmd: JsonObject, schema: EventSchema): JsonObject {
  const order = commandOrder(cmd, schema);
  return order ? ordered(cmd, order) : cmd;
}

/** 조건의 키 순서: 판정하는 꼴의 인자 순서, 나머지는 뒤 */
export function orderCondition(cond: JsonObject, schema: EventSchema): JsonObject {
  const kind = judgedCondition(schema, cond);
  return kind ? ordered(
    cond,
    kind.args.map((a) => a.name),
  ) : cond;
}

// ---- 키 순서 (깊게): 새 객체를 넣을 때 ----

function canonicalValue(type: ArgType | undefined, value: unknown, schema: EventSchema): unknown {
  if (!isPlainObject(value)) {
    if (type === "list" && Array.isArray(value)) return canonicalCommandList(value, schema);
    return value;
  }
  switch (type) {
    case "charset":
    case "face":
      return orderRef(value);
    case "wander":
      return ordered(value, WANDER_KEYS, (k, v) => (k === "area" && isPlainObject(v) ? orderArea(v) : v));
    case "condition":
      return orderCondition(value, schema);
    default:
      return value;
  }
}

/** 커맨드 하나를 하위 목록까지 정해진 순서로 */
export function canonicalCommand(cmd: unknown, schema: EventSchema): unknown {
  if (!isPlainObject(cmd)) return cmd;
  const spec = commandSpec(schema, cmd.code);
  if (!spec) return cmd;
  const order = ["code", ...spec.args.map((a) => a.name), ...spec.lists.map((l) => l.name)];
  return ordered(cmd, order, (k, v) => {
    const list = spec.lists.find((l) => l.name === k);
    if (list) {
      if (!Array.isArray(v)) return v;
      return list.perOption ? v.map((branch) => (Array.isArray(branch) ? canonicalCommandList(branch, schema) : branch)) : canonicalCommandList(v, schema);
    }
    return canonicalValue(spec.args.find((a) => a.name === k)?.type, v, schema);
  });
}

export function canonicalCommandList(list: readonly unknown[], schema: EventSchema): unknown[] {
  return list.map((c) => canonicalCommand(c, schema));
}

/** 이벤트 하나를 중첩 값까지 정해진 순서로 (붙여넣기, 새 이벤트) */
export function canonicalEvent(ev: unknown, schema: EventSchema): unknown {
  if (!isPlainObject(ev)) return ev;
  return ordered(
    ev,
    schema.fields.map((f) => f.name),
    (k, v) => canonicalValue(schema.fields.find((f) => f.name === k)?.type, v, schema),
  );
}

// ---- 제 모양으로 (M2 3.1 의 빈 {} 와 [] 규칙) ----
//
// 엔진은 배열 자리의 빈 객체를 빈 배열로, 객체 자리의 빈 배열을 빈 객체로 본다 (오류가 아니다).
// 저장할 때는 제 모양으로 고쳐 쓴다. 바뀐 것이 없으면 같은 객체를 돌려준다.

function isEmptyObject(v: unknown): boolean {
  return isPlainObject(v) && Object.keys(v).length === 0;
}

function isEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length === 0;
}

function fixArray(v: unknown, each?: (x: unknown) => unknown): unknown {
  if (isEmptyObject(v)) return [];
  if (!Array.isArray(v) || !each) return v;
  let changed = false;
  const out = v.map((x) => {
    const y = each(x);
    if (y !== x) changed = true;
    return y;
  });
  return changed ? out : v;
}

function fixObject(v: unknown, each?: (o: JsonObject) => JsonObject): unknown {
  if (isEmptyArray(v)) return {};
  if (!isPlainObject(v) || !each) return v;
  return each(v);
}

function replaceKeys(o: JsonObject, fix: Record<string, (v: unknown) => unknown>): JsonObject {
  let out: JsonObject | null = null;
  for (const [k, f] of Object.entries(fix)) {
    if (!hasOwn(o, k)) continue;
    const next = f(o[k]);
    if (next !== o[k]) {
      out ??= { ...o };
      out[k] = next;
    }
  }
  return out ?? o;
}

function fixCondition(cond: unknown): unknown {
  return fixObject(cond);
}

function fixCommand(cmd: unknown, schema: EventSchema): unknown {
  return fixObject(cmd, (c) => {
    const spec = commandSpec(schema, c.code);
    if (!spec) return c;
    const fix: Record<string, (v: unknown) => unknown> = {};
    for (const a of spec.args) {
      if (a.type === "face") fix[a.name] = (v) => fixObject(v);
      else if (a.type === "condition") fix[a.name] = fixCondition;
      else if (a.type === "options" || a.type === "route") fix[a.name] = (v) => fixArray(v);
    }
    for (const l of spec.lists) {
      fix[l.name] = l.perOption ? (v) => fixArray(v, (branch) => fixCommandList(branch, schema)) : (v) => fixCommandList(v, schema);
    }
    return replaceKeys(c, fix);
  });
}

function fixCommandList(list: unknown, schema: EventSchema): unknown {
  return fixArray(list, (c) => fixCommand(c, schema));
}

function fixEvent(ev: unknown, schema: EventSchema): unknown {
  return fixObject(ev, (e) =>
    replaceKeys(e, {
      charset: (v) => fixObject(v),
      wander: (v) => fixObject(v, (w) => replaceKeys(w, { area: (a) => fixObject(a) })),
      commands: (v) => fixCommandList(v, schema),
    }),
  );
}

/** 이벤트 목록 전체를 제 모양으로 */
export function fixShapes(list: readonly unknown[], schema: EventSchema): unknown[] {
  let changed = false;
  const out = list.map((ev) => {
    const next = fixEvent(ev, schema);
    if (next !== ev) changed = true;
    return next;
  });
  return changed ? out : (list as unknown[]);
}

// ---- 파일 인자의 꼴 ----

/** 이벤트 인자의 파일 값은 "./resources/..." 꼴로 쓴다 (M2 2.6) */
export function fileArgValue(projectPath: string): string {
  const bare = projectPath.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  return `./${bare}`;
}

/** 두 꼴("./a", "a")을 같은 파일로 본다 */
export function sameProjectFile(a: string, b: string): boolean {
  const bare = (p: string) => p.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  return bare(a) === bare(b);
}

// ---- 섹션 ----

let keyCounter = 0;

function freshKeys(n: number): number[] {
  return Array.from({ length: n }, () => ++keyCounter);
}

/**
 * 새 목록의 칸마다 이어받을 열쇠. 옛 목록에 같은 값(객체는 같은 객체)이 있으면 그 열쇠, 목록을 떠났던 객체가 돌아오면(되돌리기,
 * 다시 실행) 떠날 때의 열쇠, 같은 자리의 옛 칸이 아직 남았으면 그 열쇠(그 자리의 이벤트를 고쳐 새 객체가 되었다), 모두 아니면
 * 새 열쇠다. 그래서 지우기와 그 되돌리기, 더하기와 다시 실행, 옮기기, 크기 바꾸기를 지나도 같은 이벤트는 같은 열쇠다.
 * retired 는 목록을 떠난 객체의 열쇠를 적어 두는 곳이다 (이 함수가 채운다)
 */
function carryKeys(before: readonly unknown[], keys: readonly number[], after: readonly unknown[], retired: WeakMap<object, number>): number[] {
  const unused = new Map<unknown, number[]>();
  before.forEach((v, i) => {
    const at = unused.get(v);
    if (at) at.push(i);
    else unused.set(v, [i]);
  });
  const taken = new Array<boolean>(before.length).fill(false);
  const used = new Set<number>();
  const out = new Array<number | undefined>(after.length);
  const give = (j: number, key: number, from: number) => {
    out[j] = key;
    used.add(key);
    if (from >= 0) taken[from] = true;
  };
  after.forEach((v, j) => {
    const i = unused.get(v)?.shift();
    if (i !== undefined) give(j, keys[i], i);
  });
  after.forEach((v, j) => {
    if (out[j] !== undefined || typeof v !== "object" || v === null) return;
    const key = retired.get(v);
    if (key !== undefined && !used.has(key)) give(j, key, keys.indexOf(key));
  });
  after.forEach((_, j) => {
    if (out[j] === undefined && j < before.length && !taken[j]) give(j, keys[j], j);
  });
  before.forEach((v, i) => {
    if (!taken[i] && typeof v === "object" && v !== null) retired.set(v, keys[i]);
  });
  return Array.from(out, (k) => k ?? ++keyCounter);
}

/**
 * 맵 문서 하나의 events 섹션. 값은 늘 새 배열로 갈아 끼운다 (명령의 되돌리기가 앞뒤 배열을 들고 있다).
 * raw 가 null 이면 키가 없는 것과 같다 (M2 3.1). 이벤트가 없으면 키를 쓰지 않고, 이벤트를 더하면 배열로 쓴다.
 * raw 가 배열 자리가 아니면(글, 숫자, 비지 않은 객체) usable 이 거짓이고 저장할 때 원래 값을 그대로 쓴다.
 * 칸마다 열쇠(keyAt)가 있어 목록이 바뀌어도 같은 이벤트를 가리킨다 (고르기가 번호 대신 쓴다)
 */
export class EventsSection {
  private items: readonly unknown[] = [];
  private itemKeys: readonly number[] = [];
  /** 목록을 떠난 이벤트 객체의 열쇠 (되돌리기로 돌아오면 같은 열쇠) */
  private readonly retired = new WeakMap<object, number>();
  private raw: unknown = undefined;
  private hadKey = false;
  /** 바뀔 때마다 오른다 (MobX 반응용) */
  revision = 0;

  constructor(
    raw: unknown,
    private schema: EventSchema,
  ) {
    this.load(raw);
    makeObservable<EventsSection, "items" | "itemKeys">(this, { items: observable.ref, itemKeys: observable.ref, revision: observable, replace: action, reset: action });
  }

  private load(raw: unknown): void {
    // null 은 없는 키 (mapfile.py 도 null 인 events 는 쓰지 않는다)
    this.raw = raw === null ? undefined : raw;
    this.hadKey = this.raw !== undefined;
    this.items = asList(this.raw) ?? [];
    this.itemKeys = freshKeys(this.items.length);
  }

  /** 지금 이벤트 목록 (JSON 그대로. null 칸과 틀린 값도 있다) */
  get list(): readonly unknown[] {
    return this.items;
  }

  /** index 번째 이벤트의 열쇠 (목록이 바뀌어도 같은 이벤트면 같다). 목록 밖이면 undefined */
  keyAt(index: number): number | undefined {
    return this.itemKeys[index];
  }

  /** 열쇠의 지금 번호. 없으면 -1 */
  indexOfKey(key: number): number {
    return this.itemKeys.indexOf(key);
  }

  /** 배열 자리의 값이었는가. 아니면 편집을 막는다 */
  get usable(): boolean {
    return this.raw === undefined || isArrayPlace(this.raw);
  }

  /** usable 이 아닐 때의 이유 */
  get shapeError(): string | null {
    return this.usable ? null : "events 가 배열이 아니다";
  }

  setSchema(schema: EventSchema): void {
    this.schema = schema;
  }

  /** 명령만 부른다 */
  replace(list: readonly unknown[]): void {
    this.itemKeys = carryKeys(this.items, this.itemKeys, list, this.retired);
    this.items = list;
    this.revision++;
  }

  /** 파일을 다시 읽었다 */
  reset(raw: unknown): void {
    this.load(raw);
    this.revision++;
  }

  eventAt(index: number): JsonObject | undefined {
    const ev = this.items[index];
    return isPlainObject(ev) ? ev : undefined;
  }

  /** id 로 찾는다 (겹치면 앞의 것) */
  indexOfId(id: string): number {
    return this.items.findIndex((ev) => isObjectPlace(ev) && field(ev, "id") === id);
  }

  /** 글인 id 전부 (파일 순서, 겹친 것도) */
  ids(): string[] {
    const out: string[] = [];
    for (const ev of this.items) {
      const id = field(ev, "id");
      if (typeof id === "string") out.push(id);
    }
    return out;
  }

  /** 맵 파일에 쓸 값. undefined 면 events 키를 쓰지 않는다 */
  serialize(): unknown {
    if (!this.usable) return this.raw;
    if (!this.hadKey && this.items.length === 0) return undefined;
    return fixShapes(this.items, this.schema);
  }
}
