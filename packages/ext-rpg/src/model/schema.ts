// 이벤트 스키마 resources/schema/event-commands.json (엔진 docs/plans/m2-rpg-events.md 2.2, 2.3).
//
// 커맨드 17종의 인자, 조건 세 꼴, 이벤트 칸, 외형과 얼굴의 논리 이름, 시트 규격, 이동 루트의 걸음을 한 장에 적는다.
// 에디터는 이 파일로 폼과 검사를 만들고, 엔진 테스트가 같은 파일을 commands.lua 와 대조한다.
// 모르는 버전이면 EventSchemaVersionError 를 던진다 (이벤트 레이어를 읽기 전용으로 잠그는 이유가 된다).

import { hasOwn, isPlainObject, type JsonObject } from "./json";

export const EVENT_SCHEMA_PATH = "resources/schema/event-commands.json";
export const EVENT_SCHEMA_VERSION = 1;

export const ARG_TYPES = [
  "string",
  "text",
  "integer",
  "number",
  "boolean",
  "enum",
  "scalar",
  "ref",
  "file",
  "face",
  "charset",
  "options",
  "route",
  "condition",
  "wander",
  "json",
  "list",
] as const;
export type ArgType = (typeof ARG_TYPES)[number];

export const REF_KINDS = ["map", "item", "flag", "var", "character"] as const;
export type RefKind = (typeof REF_KINDS)[number];

/** 이벤트 칸이나 커맨드와 조건의 인자 하나 */
export interface ArgSpec {
  name: string;
  type: ArgType;
  label: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  /** enum 의 값 */
  values?: string[];
  /** ref 의 종류 */
  ref?: RefKind;
  /** file 의 확장자 */
  accept?: string[];
  /** file 의 시작 폴더 */
  dir?: string;
  /** 자유 입력 칸의 제안 */
  suggest?: string[];
}

/** 커맨드가 품는 하위 목록. perOption 이면 그 인자의 항목마다 가지 하나 */
export interface ListSpec {
  name: string;
  label: string;
  perOption?: string;
}

export interface CommandSpec {
  code: string;
  label: string;
  group: string;
  summary?: string;
  /** 이 뒤의 커맨드는 실행되지 않는다 (transfer, scene) */
  ends: boolean;
  args: ArgSpec[];
  lists: ListSpec[];
}

export interface ConditionSpec {
  kind: string;
  label: string;
  args: ArgSpec[];
}

export interface CharsetSheet {
  frameW: number;
  frameH: number;
  sheetCols: number;
  perSheet: number;
  patterns: number;
  standPattern: number;
  dirRows: Record<string, number>;
}

export interface FaceSheet {
  size: number;
  cols: number;
  perSheet: number;
}

export type AssetKind = "charset" | "face";

export interface EventSchema {
  version: number;
  /** 이벤트 칸. 이 순서가 저장할 때의 키 순서다 */
  fields: ArgSpec[];
  /** 이벤트 id 로 쓸 수 없는 이름 (player) */
  reserved: string[];
  commands: CommandSpec[];
  /** 순서가 엔진의 판정 순서다 (item, flag, var) */
  conditions: ConditionSpec[];
  /** 논리 이름 → 후보 파일 (앞이 RTP, 뒤가 플레이스홀더) */
  assets: Record<AssetKind, ReadonlyMap<string, readonly string[]>>;
  sheets: { charset: CharsetSheet; face: FaceSheet };
  route: { moves: string[]; turnPrefix: string; waitPrefix: string };
  /** 깃발과 변수 이름으로 쓸 수 없는 state 자리 (items) */
  stateReserved: string[];
}

export class EventSchemaError extends Error {
  constructor(
    message: string,
    public readonly location?: string,
  ) {
    super(location ? `${location}: ${message}` : message);
    this.name = "EventSchemaError";
  }
}

/** 모르는 버전. 레이어는 붙되 읽기 전용으로 잠근다 */
export class EventSchemaVersionError extends EventSchemaError {
  constructor(public readonly version: unknown) {
    super(`모르는 버전 ${String(version)} (이 에디터는 ${EVENT_SCHEMA_VERSION})`, "version");
    this.name = "EventSchemaVersionError";
  }
}

/** 스키마를 읽지 못한 이유를 레이어의 잠금 문구로. 버전 문제가 아니면 null */
export function schemaLockReason(error: unknown): string | null {
  if (error instanceof EventSchemaVersionError) {
    return `event-commands.json 의 버전 ${String(error.version)} 을 모른다. 이 에디터는 버전 ${EVENT_SCHEMA_VERSION} 만 고칠 수 있다`;
  }
  return null;
}

export function commandSpec(schema: EventSchema, code: unknown): CommandSpec | undefined {
  if (typeof code !== "string") return undefined;
  return schema.commands.find((c) => c.code === code);
}

export function fieldSpec(schema: EventSchema, name: string): ArgSpec | undefined {
  return schema.fields.find((f) => f.name === name);
}

/** 판정하는 꼴: conditions 순서로 먼저 있는 키 (null 은 없는 키) */
export function judgedCondition(schema: EventSchema, cond: unknown): ConditionSpec | undefined {
  if (!isPlainObject(cond)) return undefined;
  return schema.conditions.find((c) => hasOwn(cond, c.kind) && cond[c.kind] !== null && cond[c.kind] !== undefined);
}

/** enum 칸의 값 (없으면 빈 배열) */
export function fieldValues(schema: EventSchema, name: string): string[] {
  return fieldSpec(schema, name)?.values ?? [];
}

/** 논리 이름의 후보 파일 */
export function assetCandidates(schema: EventSchema, kind: AssetKind, set: string): readonly string[] | undefined {
  return schema.assets[kind].get(set);
}

/** 시트 한 장의 칸 수 (외형 8명, 얼굴 16개) */
export function sheetCount(schema: EventSchema, kind: AssetKind): number {
  return kind === "charset" ? schema.sheets.charset.perSheet : schema.sheets.face.perSheet;
}

// ---- 읽기 ----

function fail(location: string, message: string): never {
  throw new EventSchemaError(message, location);
}

function obj(v: unknown, where: string): JsonObject {
  if (!isPlainObject(v)) fail(where, "객체여야 한다");
  return v;
}

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, "배열이어야 한다");
  return v;
}

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || v === "") fail(where, "비어 있지 않은 글이어야 한다");
  return v;
}

function strings(v: unknown, where: string): string[] {
  return arr(v, where).map((s, i) => str(s, `${where}[${i}]`));
}

function posInt(v: unknown, where: string, min = 1): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) fail(where, `${min} 이상의 정수여야 한다`);
  return v;
}

function optNumber(v: unknown, where: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) fail(where, "수여야 한다");
  return v;
}

function unique(names: string[], where: string, what: string): void {
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) fail(where, `${what} ${n} 가 겹친다`);
    seen.add(n);
  }
}

function parseArg(raw: unknown, where: string): ArgSpec {
  const a = obj(raw, where);
  const name = str(a.name, `${where}.name`);
  const type = a.type as ArgType;
  if (!ARG_TYPES.includes(type)) fail(`${where}.type`, `모르는 타입 ${String(a.type)}`);
  const spec: ArgSpec = {
    name,
    type,
    label: typeof a.label === "string" ? a.label : name,
    required: a.required === true,
  };
  if (a.required !== undefined && typeof a.required !== "boolean") fail(`${where}.required`, "참거짓이어야 한다");
  if (hasOwn(a, "default")) spec.default = a.default;
  const min = optNumber(a.min, `${where}.min`);
  const max = optNumber(a.max, `${where}.max`);
  if (min !== undefined) spec.min = min;
  if (max !== undefined) spec.max = max;
  if (min !== undefined && max !== undefined && min > max) fail(`${where}.min`, "max 보다 크다");
  if (type === "enum" || a.values !== undefined) {
    spec.values = strings(a.values, `${where}.values`);
    if (spec.values.length === 0) fail(`${where}.values`, "값이 하나 이상 있어야 한다");
  }
  if (type === "ref") {
    if (!REF_KINDS.includes(a.ref as RefKind)) fail(`${where}.ref`, `ref 는 ${REF_KINDS.join(", ")} 중 하나다`);
    spec.ref = a.ref as RefKind;
  }
  if (a.accept !== undefined) spec.accept = strings(a.accept, `${where}.accept`);
  if (a.dir !== undefined) spec.dir = str(a.dir, `${where}.dir`);
  if (a.suggest !== undefined) spec.suggest = strings(a.suggest, `${where}.suggest`);
  return spec;
}

function parseArgs(raw: unknown, where: string): ArgSpec[] {
  if (raw === undefined) return [];
  const args = arr(raw, where).map((a, i) => parseArg(a, `${where}[${i}]`));
  unique(
    args.map((a) => a.name),
    where,
    "인자",
  );
  return args;
}

function parseCommand(raw: unknown, where: string): CommandSpec {
  const c = obj(raw, where);
  const code = str(c.code, `${where}.code`);
  const args = parseArgs(c.args, `${where}.args`);
  if (args.some((a) => a.name === "code")) fail(`${where}.args`, "인자 이름으로 code 를 쓸 수 없다");
  for (const a of args) {
    if (a.type === "charset" || a.type === "wander" || a.type === "list") fail(`${where}.args`, `${a.type} 는 이벤트 칸에만 쓴다 (${a.name})`);
  }
  const lists: ListSpec[] = c.lists === undefined ? [] : arr(c.lists, `${where}.lists`).map((l, i) => {
    const lw = `${where}.lists[${i}]`;
    const lo = obj(l, lw);
    const spec: ListSpec = { name: str(lo.name, `${lw}.name`), label: typeof lo.label === "string" ? lo.label : String(lo.name) };
    if (lo.perOption !== undefined) {
      const target = args.find((a) => a.name === lo.perOption);
      if (!target || target.type !== "options") fail(`${lw}.perOption`, `options 인자를 가리켜야 한다 (${String(lo.perOption)})`);
      spec.perOption = target.name;
    }
    return spec;
  });
  unique([...args.map((a) => a.name), ...lists.map((l) => l.name)], where, "인자나 목록");
  if (c.ends !== undefined && typeof c.ends !== "boolean") fail(`${where}.ends`, "참거짓이어야 한다");
  const spec: CommandSpec = {
    code,
    label: typeof c.label === "string" ? c.label : code,
    group: typeof c.group === "string" ? c.group : "",
    ends: c.ends === true,
    args,
    lists,
  };
  if (c.summary !== undefined) {
    if (typeof c.summary !== "string") fail(`${where}.summary`, "글이어야 한다");
    spec.summary = c.summary;
  }
  return spec;
}

function parseCondition(raw: unknown, where: string): ConditionSpec {
  const c = obj(raw, where);
  const kind = str(c.kind, `${where}.kind`);
  const args = parseArgs(c.args, `${where}.args`);
  if (args.length === 0 || args[0].name !== kind || !args[0].required) fail(`${where}.args`, `첫 인자는 ${kind} 이름의 필수 인자여야 한다`);
  return { kind, label: typeof c.label === "string" ? c.label : kind, args };
}

function parseAssetSets(raw: unknown, where: string): ReadonlyMap<string, readonly string[]> {
  const o = obj(raw, where);
  const out = new Map<string, readonly string[]>();
  for (const [name, list] of Object.entries(o)) {
    const files = strings(list, `${where}.${name}`);
    if (files.length === 0) fail(`${where}.${name}`, "후보가 하나 이상 있어야 한다");
    out.set(name, files);
  }
  return out;
}

function parseSheets(raw: unknown): EventSchema["sheets"] {
  const s = obj(raw, "sheets");
  const c = obj(s.charset, "sheets.charset");
  const dirRows = obj(c.dirRows, "sheets.charset.dirRows");
  const rows: Record<string, number> = {};
  for (const [dir, row] of Object.entries(dirRows)) rows[dir] = posInt(row, `sheets.charset.dirRows.${dir}`, 0);
  const charset: CharsetSheet = {
    frameW: posInt(c.frameW, "sheets.charset.frameW"),
    frameH: posInt(c.frameH, "sheets.charset.frameH"),
    sheetCols: posInt(c.sheetCols, "sheets.charset.sheetCols"),
    perSheet: posInt(c.perSheet, "sheets.charset.perSheet"),
    patterns: posInt(c.patterns, "sheets.charset.patterns"),
    standPattern: posInt(c.standPattern, "sheets.charset.standPattern", 0),
    dirRows: rows,
  };
  if (charset.standPattern >= charset.patterns) fail("sheets.charset.standPattern", "patterns 보다 작아야 한다");
  const f = obj(s.face, "sheets.face");
  return {
    charset,
    face: { size: posInt(f.size, "sheets.face.size"), cols: posInt(f.cols, "sheets.face.cols"), perSheet: posInt(f.perSheet, "sheets.face.perSheet") },
  };
}

/** event-commands.json 을 읽는다. 틀린 곳은 위치와 함께 EventSchemaError 로 던진다 */
export function parseEventSchema(text: string): EventSchema {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new EventSchemaError(`JSON 이 아니다: ${(e as Error).message}`);
  }
  if (!isPlainObject(raw)) throw new EventSchemaError("스키마는 객체여야 한다");
  if (raw.version !== EVENT_SCHEMA_VERSION) throw new EventSchemaVersionError(raw.version);

  const event = obj(raw.event, "event");
  const fields = parseArgs(event.fields, "event.fields");
  if (fields.length === 0) fail("event.fields", "칸이 하나 이상 있어야 한다");
  for (const name of ["id", "x", "y"]) {
    if (!fields.some((f) => f.name === name)) fail("event.fields", `${name} 칸이 없다`);
  }
  const reserved = event.reserved === undefined ? [] : strings(event.reserved, "event.reserved");

  const commands = arr(raw.commands, "commands").map((c, i) => parseCommand(c, `commands[${i}]`));
  unique(
    commands.map((c) => c.code),
    "commands",
    "code",
  );
  const conditions = arr(raw.conditions, "conditions").map((c, i) => parseCondition(c, `conditions[${i}]`));
  unique(
    conditions.map((c) => c.kind),
    "conditions",
    "kind",
  );

  const assets = obj(raw.assets, "assets");
  const route = obj(raw.route, "route");
  const state = raw.state === undefined ? {} : obj(raw.state, "state");

  return {
    version: EVENT_SCHEMA_VERSION,
    fields,
    reserved,
    commands,
    conditions,
    assets: { charset: parseAssetSets(assets.charset, "assets.charset"), face: parseAssetSets(assets.face, "assets.face") },
    sheets: parseSheets(raw.sheets),
    route: {
      moves: strings(route.moves, "route.moves"),
      turnPrefix: str(route.turnPrefix, "route.turnPrefix"),
      waitPrefix: str(route.waitPrefix, "route.waitPrefix"),
    },
    stateReserved: state.reserved === undefined ? [] : strings(state.reserved, "state.reserved"),
  };
}
