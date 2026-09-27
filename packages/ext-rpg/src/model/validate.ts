// 이벤트 검사 (엔진 M2 3.2 의 표와 E5 3절, 4절의 에디터만의 검사).
//
// 두 무리다.
//   engine  엔진 MapData.validateEvents 와 같은 검사, 같은 경로. 엔진은 이런 이벤트를 건너뛰고 rpg:error 를 찍는다.
//           두 저장소가 같은 픽스처(tests/fixtures/events/invalid_events.json)로 같은 경로 집합을 내는지 대조한다
//   editor  엔진이 모르는 것: 맵 밖, 같은 칸, 없는 참조, 없는 파일, 배열 끝의 null 등. 픽스처에 넣지 않는다
// 경로는 엔진과 같은 1부터 세는 표기다 (events[3].commands[2].branches[1][3].text).

import { asList, engineLength, field, isArrayPlace, isFiniteNumber, isInteger, isNonNegInt, isObjectPlace, isPlainObject, type JsonObject } from "./json";
import { AREA_KEYS, REF_KEYS, WANDER_KEYS } from "./events";
import { commandSpec, fieldValues, judgedCondition, sheetCount, type ArgSpec, type AssetKind, type CommandSpec, type EventSchema } from "./schema";
import { mapByName, type GameConfig } from "./game";
import { findDuplicateBlocks, placeSuffix } from "./tree";

export type Severity = "error" | "warning" | "info";

export interface EventProblem {
  severity: Severity;
  message: string;
  /** events[3].commands[2].text 꼴 */
  location: string;
  /** engine 이면 엔진도 같은 경로에 같은 문제를 낸다 */
  source: "engine" | "editor";
  eventIndex?: number;
  eventId?: string;
}

export interface PathProblem {
  path: string;
  message: string;
}

/** 맵의 크기와 통행 (MapModel, MapData 가 그대로 맞는다) */
export interface MapGeometry {
  width: number;
  height: number;
  /** 0 지나감, 그 밖은 막힘. 없으면 null */
  collision: readonly number[] | null;
}

export interface ValidateContext {
  schema: EventSchema;
  /** 있으면 맵 밖과 통행을 본다 */
  map?: MapGeometry | null;
  /** 있으면 map 참조를 본다 */
  game?: GameConfig | null;
  /** 있으면 item 참조를 본다 */
  items?: ReadonlySet<string> | null;
  /** 정의 파일(Lua)에서 찾은 이벤트 id (어림). 같은 id 는 게임에서 Lua 가 이긴다 */
  defIds?: ReadonlySet<string> | null;
  /** 있으면 파일 인자와 외형, 얼굴의 파일이 있는지 본다 (프로젝트 기준 경로, ./ 없이) */
  fileExists?: ((projectPath: string) => boolean) | null;
}

type Add = (path: string, message: string) => void;

// ---- 엔진과 같은 검사 ----

const TYPE_NAMES: Record<string, string> = {
  string: "글",
  text: "글",
  enum: "글",
  ref: "id 글",
  file: "경로 글",
  integer: "정수",
  number: "수",
  boolean: "참거짓",
  scalar: "참거짓, 수, 글 중 하나",
  json: "JSON 값",
  face: "얼굴 객체",
  options: "항목 배열",
  route: "걸음 배열",
  condition: "조건 객체",
};

function subject(word: string): string {
  const last = word.codePointAt(word.length - 1) ?? 0;
  const noFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 === 0;
  return word + (noFinal ? "가" : "이");
}

function typeOfValue(v: unknown): string {
  if (v === null || v === undefined) return "nil";
  if (Array.isArray(v) || isPlainObject(v)) return "table";
  return typeof v;
}

const VALUE_TESTS: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  text: (v) => typeof v === "string",
  enum: (v) => typeof v === "string",
  ref: (v) => typeof v === "string",
  file: (v) => typeof v === "string",
  integer: isInteger,
  number: isFiniteNumber,
  boolean: (v) => typeof v === "boolean",
  scalar: (v) => typeof v === "boolean" || isFiniteNumber(v) || typeof v === "string",
  json: () => true,
};

/** 외형과 얼굴 참조의 모양 (엔진 Assets.checkRef). path 는 "" | ".set" | ".file" | ".index" */
export function checkAssetRef(schema: EventSchema, kind: AssetKind, ref: unknown, add: Add): void {
  if (!isObjectPlace(ref)) {
    add("", "객체가 아니다");
    return;
  }
  const set = field(ref, "set");
  const file = field(ref, "file");
  const hasSet = set !== undefined;
  const hasFile = file !== undefined;
  if (hasSet && hasFile) add("", "set 과 file 중 하나만 적는다");
  else if (!hasSet && !hasFile) add("", "set 이나 file 이 필요하다");
  if (hasSet && (typeof set !== "string" || !schema.assets[kind].has(set))) add(".set", `모르는 ${kind} 이름 ${String(set)}`);
  if (hasFile && (typeof file !== "string" || file === "")) add(".file", "경로가 글이 아니다");
  const index = field(ref, "index");
  const count = sheetCount(schema, kind);
  if (index !== undefined && !(isInteger(index) && index >= 0 && index < count)) add(".index", `0..${count - 1} 의 정수가 아니다 (지금은 ${String(index)})`);
}

function checkStrings(value: unknown, here: string, add: Add, what: string): number | null {
  const list = asList(value);
  if (!list) {
    add(here, `${what} 목록이 배열이 아니다`);
    return null;
  }
  const count = engineLength(list);
  for (let k = 0; k < count; k++) {
    if (typeof list[k] !== "string") add(`${here}[${k + 1}]`, `${subject(what)} 글이 아니다 (지금은 ${typeOfValue(list[k])})`);
  }
  return count;
}

/** 인자 하나 (엔진 checkArg). 인자 하나에는 문제를 하나만 낸다: 타입, 그다음 빈 경로, 예약 이름, values, 범위 */
export function checkArg(schema: EventSchema, spec: ArgSpec, value: unknown, here: string, add: Add): void {
  if (value === undefined || value === null) {
    if (spec.required) add(here, `${subject(TYPE_NAMES[spec.type] ?? spec.type)} 필요하다`);
    return;
  }
  switch (spec.type) {
    case "face":
      checkAssetRef(schema, "face", value, (p, m) => add(here + p, `얼굴: ${m}`));
      return;
    case "options": {
      const count = checkStrings(value, here, add, "항목");
      if (count !== null && spec.min !== undefined && count < spec.min) add(here, `항목이 ${spec.min}개 이상 필요하다`);
      return;
    }
    case "route":
      checkStrings(value, here, add, "걸음");
      return;
    case "condition": {
      if (!isObjectPlace(value)) {
        add(here, `조건이 객체가 아니다 (지금은 ${typeOfValue(value)})`);
        return;
      }
      const kind = judgedCondition(schema, value);
      if (kind) for (const a of kind.args) checkArg(schema, a, field(value, a.name), `${here}.${a.name}`, add);
      return;
    }
    case "charset":
    case "wander":
    case "list":
      return;
  }
  const test = VALUE_TESTS[spec.type];
  if (test && !test(value)) {
    const shown = typeof value === "number" ? String(value) : typeOfValue(value);
    add(here, `${subject(TYPE_NAMES[spec.type])} 아니다 (지금은 ${shown})`);
  } else if (spec.type === "file" && value === "") {
    add(here, "경로가 비었다");
  } else if (spec.type === "ref" && (spec.ref === "flag" || spec.ref === "var") && schema.stateReserved.includes(value as string)) {
    add(here, `${String(value)} 는 소지품 자리라 깃발이나 변수 이름으로 쓸 수 없다`);
  } else if (spec.values && !spec.values.includes(value as string)) {
    add(here, `${spec.values.join(", ")} 중 하나가 아니다 (지금은 ${String(value)})`);
  } else if (typeof value === "number" && spec.min !== undefined && value < spec.min) {
    add(here, `${spec.min} 이상이 아니다 (지금은 ${value})`);
  } else if (typeof value === "number" && spec.max !== undefined && value > spec.max) {
    add(here, `${spec.max} 이하가 아니다 (지금은 ${value})`);
  }
}

/** 커맨드 하나의 인자와 하위 목록 (엔진 checkList 의 한 칸). here 는 그 커맨드의 경로 */
export function checkCommand(schema: EventSchema, cmd: unknown, here: string, add: Add): void {
  if (!isObjectPlace(cmd)) {
    add(here, "커맨드가 객체가 아니다");
    return;
  }
  const code = field(cmd, "code");
  const spec = commandSpec(schema, code);
  if (!spec) {
    add(here, `알 수 없는 code ${String(code)}`);
    return;
  }
  for (const a of spec.args) checkArg(schema, a, field(cmd, a.name), `${here}.${a.name}`, add);
  // 엔진의 따로 규칙(등록된 스크립트인가) 가운데 에디터도 가릴 수 있는 것: 빈 이름은 등록된 이름일 수 없다.
  // 없는 이름은 필수 검사가 같은 자리에 낸다. 비지 않은 이름은 엔진만 가린다 (에디터만의 정보)
  if (spec.code === "script" && field(cmd, "name") === "") add(`${here}.name`, "등록되지 않은 스크립트 (이름이 비었다)");
  checkSubLists(schema, spec, cmd, here, add);
}

function checkSubLists(schema: EventSchema, spec: CommandSpec, cmd: unknown, here: string, add: Add): void {
  for (const l of spec.lists) {
    const value = field(cmd, l.name);
    if (value === undefined) continue;
    const at = `${here}.${l.name}`;
    const lists = asList(value);
    if (!lists) {
      add(at, "가지 목록이 배열이 아니다");
      continue;
    }
    if (!l.perOption) {
      checkCommandList(schema, lists, at, add);
      continue;
    }
    for (let b = 0; b < engineLength(lists); b++) {
      const branch = lists[b];
      if (!isArrayPlace(branch)) add(`${at}[${b + 1}]`, "가지 목록이 배열이 아니다");
      else checkCommandList(schema, branch, `${at}[${b + 1}]`, add);
    }
  }
}

/** 커맨드 목록 (엔진 Commands.problems). prefix 는 목록의 경로 */
export function checkCommandList(schema: EventSchema, list: unknown, prefix: string, add: Add): void {
  const items = asList(list);
  if (!items) {
    add(prefix, "커맨드 목록이 배열이 아니다");
    return;
  }
  for (let j = 0; j < engineLength(items); j++) checkCommand(schema, items[j], `${prefix}[${j + 1}]`, add);
}

// 배회 기본값 (엔진 character.lua 의 setWander 와 같다)
const WANDER_MIN = 30;
const WANDER_MAX = 120;

function checkWander(wander: unknown, here: string, add: Add): void {
  if (!isObjectPlace(wander)) {
    add(here, "배회가 객체가 아니다");
    return;
  }
  const minWait = field(wander, "minWait");
  const maxWait = field(wander, "maxWait");
  if (minWait !== undefined && !isNonNegInt(minWait)) add(`${here}.minWait`, "0 이상의 정수가 아니다");
  if (maxWait !== undefined && !isNonNegInt(maxWait)) add(`${here}.maxWait`, "0 이상의 정수가 아니다");
  const lo = minWait === undefined ? WANDER_MIN : minWait;
  const hi = maxWait === undefined ? WANDER_MAX : maxWait;
  if (isNonNegInt(lo) && isNonNegInt(hi) && lo > hi) add(`${here}${maxWait !== undefined ? ".maxWait" : ".minWait"}`, `minWait(${lo})가 maxWait(${hi})보다 크다`);
  const area = field(wander, "area");
  if (area === undefined) return;
  if (!isObjectPlace(area)) {
    add(`${here}.area`, "구역이 객체가 아니다");
    return;
  }
  for (const k of ["x", "y"]) if (!isNonNegInt(field(area, k))) add(`${here}.area.${k}`, "0 이상의 정수가 아니다");
  for (const k of ["w", "h"]) {
    const v = field(area, k);
    if (!(isInteger(v) && v >= 1)) add(`${here}.area.${k}`, "1 이상의 정수가 아니다");
  }
}

/** 이벤트 칸 하나 (commands 는 빼고). here 는 그 칸의 경로. 편집 명령이 새 값을 검사할 때도 쓴다 */
export function checkEventField(schema: EventSchema, name: string, value: unknown, here: string, add: Add): void {
  switch (name) {
    case "id":
      if (typeof value !== "string" || value === "") add(here, "id 가 비었거나 글이 아니다");
      else if (schema.reserved.includes(value)) add(here, `예약된 id ${value}`);
      return;
    case "x":
    case "y":
      if (!isNonNegInt(value)) add(here, `0 이상의 정수가 아니다 (지금은 ${String(value)})`);
      return;
    case "dir":
    case "trigger":
      if (value !== undefined && (typeof value !== "string" || !fieldValues(schema, name).includes(value))) add(here, `모르는 ${name === "dir" ? "방향" : "트리거"} ${String(value)}`);
      return;
    case "charset":
      if (value !== undefined) checkAssetRef(schema, "charset", value, (p, m) => add(here + p, `외형: ${m}`));
      return;
    case "through":
    case "solid":
      if (value !== undefined && typeof value !== "boolean") add(here, "참거짓이 아니다");
      return;
    case "speed":
      if (value !== undefined && !(isFiniteNumber(value) && value > 0)) add(here, "0 보다 큰 수가 아니다");
      return;
    case "wander":
      if (value !== undefined) checkWander(value, here, add);
      return;
    case "commands":
      if (value !== undefined) checkCommandList(schema, value, here, add);
      return;
  }
}

const EVENT_FIELDS_CHECKED = ["id", "x", "y", "dir", "trigger", "charset", "through", "solid", "speed", "wander", "commands"];

/** 이벤트 하나 (엔진 checkEvent). seen 은 앞 이벤트들의 id → 1부터 센 번호 */
function checkEvent(schema: EventSchema, ev: unknown, here: string, seen: ReadonlyMap<string, number>, add: Add): void {
  if (!isObjectPlace(ev)) {
    add(here, "이벤트가 객체가 아니다");
    return;
  }
  for (const name of EVENT_FIELDS_CHECKED) {
    const value = field(ev, name);
    checkEventField(schema, name, value, `${here}.${name}`, add);
    if (name === "id" && typeof value === "string" && value !== "" && !schema.reserved.includes(value) && seen.has(value)) {
      add(`${here}.id`, `id ${value} 가 events[${seen.get(value)}] 와 겹친다`);
    }
  }
}

/** 엔진 MapData.validateEvents 와 같은 문제 목록 (경로와 이유) */
export function engineProblems(events: unknown, schema: EventSchema): PathProblem[] {
  const problems: PathProblem[] = [];
  const add: Add = (path, message) => problems.push({ path, message });
  if (events === undefined || events === null) return problems;
  const list = asList(events);
  if (!list) {
    add("events", "이벤트 목록이 배열이 아니다");
    return problems;
  }
  const seen = new Map<string, number>();
  for (let i = 0; i < engineLength(list); i++) {
    const ev = list[i];
    checkEvent(schema, ev, `events[${i + 1}]`, seen, add);
    const id = field(ev, "id");
    if (isObjectPlace(ev) && typeof id === "string" && !seen.has(id)) seen.set(id, i + 1);
  }
  return problems;
}

// ---- 에디터만의 검사 ----

function eventIndexOf(path: string): number | undefined {
  const m = /^events\[(\d+)\]/.exec(path);
  return m ? Number(m[1]) - 1 : undefined;
}

function trailingNull(list: readonly unknown[]): number | null {
  const n = engineLength(list);
  return n < list.length ? n : null;
}

const TRIGGER_DEFAULT = "action";

function cellText(x: number, y: number): string {
  return `${x},${y}`;
}

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

function bare(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

interface EditorScope {
  ctx: ValidateContext;
  ids: ReadonlySet<string>;
  /** id → 외형이 있는가 */
  hasCharset: ReadonlyMap<string, boolean>;
  add: (severity: Severity, path: string, message: string) => void;
}

function checkUnknownKeys(o: unknown, known: readonly string[], here: string, what: string, scope: EditorScope): void {
  if (!isPlainObject(o)) return;
  for (const k of Object.keys(o)) {
    if (!known.includes(k) && o[k] !== undefined) scope.add("info", `${here}.${k}`, `스키마에 없는 ${what} ${k} (지우지 않고 그대로 둔다)`);
  }
}

function checkFile(value: unknown, here: string, accept: readonly string[] | undefined, scope: EditorScope): void {
  if (typeof value !== "string" || value === "") return;
  if (accept && accept.length > 0 && !accept.includes(extOf(value))) scope.add("warning", here, `확장자가 ${accept.join(", ")} 가 아니다`);
  const exists = scope.ctx.fileExists;
  if (exists && !exists(bare(value))) scope.add("warning", here, `프로젝트에 없는 파일 ${value}`);
}

function checkRef(spec: ArgSpec, value: unknown, here: string, scope: EditorScope): void {
  if (typeof value !== "string") return;
  const { ctx } = scope;
  if (value === "") {
    scope.add("warning", here, `${subject(spec.label)} 비었다`);
    return;
  }
  switch (spec.ref) {
    case "map":
      if (ctx.game && !mapByName(ctx.game, value)) scope.add("warning", here, `rpg-game.json 에 등록되지 않은 맵 ${value}`);
      return;
    case "item":
      if (ctx.items && !ctx.items.has(value)) scope.add("warning", here, `아이템 표에 없는 id ${value}`);
      return;
    case "character":
      if (ctx.schema.reserved.includes(value)) return;
      if (!scope.ids.has(value)) scope.add("warning", here, `이 맵에 없는 이벤트 ${value}`);
      else if (scope.hasCharset.get(value) === false) scope.add("warning", here, `${value} 는 외형이 없어 움직이거나 돌 수 없다 (엔진이 아무것도 하지 않는다)`);
      return;
  }
}

function checkRouteSteps(value: unknown, here: string, scope: EditorScope): void {
  const list = asList(value);
  if (!list) return;
  const { moves, turnPrefix, waitPrefix } = scope.ctx.schema.route;
  list.forEach((step, k) => {
    if (typeof step !== "string") return;
    if (moves.includes(step)) return;
    if (step.startsWith(turnPrefix) && moves.includes(step.slice(turnPrefix.length))) return;
    if (step.startsWith(waitPrefix) && /^\d+$/.test(step.slice(waitPrefix.length))) return;
    scope.add("warning", `${here}[${k + 1}]`, `모르는 걸음 ${step} (실행이 건너뛴다)`);
  });
}

function checkArrayTail(value: unknown, here: string, scope: EditorScope): void {
  if (!Array.isArray(value)) return;
  const tail = trailingNull(value);
  if (tail !== null) scope.add("error", `${here}[${tail + 1}]`, "배열 끝의 null 은 엔진이 보지 못한다 (지우고 쓴다)");
}

function checkConditionEditor(cond: unknown, here: string, scope: EditorScope): void {
  if (!isObjectPlace(cond)) return;
  const { schema } = scope.ctx;
  const present = schema.conditions.filter((c) => field(cond, c.kind) !== undefined);
  if (present.length === 0) {
    scope.add("warning", here, "비어 있는 조건이다 (늘 참이라 아니면 가지가 돌지 않는다)");
    return;
  }
  if (present.length > 1) scope.add("warning", here, `조건의 꼴이 둘 이상이다 (${present.map((c) => c.kind).join(", ")}). 엔진은 앞의 ${present[0].kind} 만 본다`);
  const kind = present[0];
  for (const a of kind.args) {
    const v = field(cond, a.name);
    if (a.type === "ref") checkRef(a, v, `${here}.${a.name}`, scope);
  }
  const known = new Set(schema.conditions.flatMap((c) => c.args.map((a) => a.name)));
  checkUnknownKeys(cond, [...known], here, "조건 칸", scope);
}

function checkCommandEditor(cmd: JsonObject, here: string, spec: CommandSpec, scope: EditorScope): void {
  for (const a of spec.args) {
    const v = field(cmd, a.name);
    const at = `${here}.${a.name}`;
    if (v === undefined) continue;
    if (a.type === "ref") checkRef(a, v, at, scope);
    else if (a.type === "file") checkFile(v, at, a.accept, scope);
    else if (a.type === "route") {
      checkArrayTail(v, at, scope);
      checkRouteSteps(v, at, scope);
    } else if (a.type === "options") checkArrayTail(v, at, scope);
    else if (a.type === "condition") checkConditionEditor(v, at, scope);
    else if (a.type === "face") {
      checkUnknownKeys(v, REF_KEYS, at, "칸", scope);
      checkFile(field(v, "file"), `${at}.file`, ["png"], scope);
    }
  }
  // 선택지: 취소가 고르는 항목이 항목 수 안인가
  const options = asList(field(cmd, "options"));
  const cancel = field(cmd, "cancel");
  if (spec.code === "choice" && options && isInteger(cancel) && cancel > engineLength(options)) {
    scope.add("warning", `${here}.cancel`, `취소키가 고르는 항목 ${cancel} 이 항목 수 ${engineLength(options)} 밖이다`);
  }
  if (spec.code === "transfer" && (field(cmd, "x") === undefined) !== (field(cmd, "y") === undefined)) {
    scope.add("warning", here, "x 와 y 중 하나만 있다 (없는 쪽은 정의 파일의 시작 값을 쓴다)");
  }
  const scriptName = field(cmd, "name");
  if (spec.code === "script" && typeof scriptName === "string" && scriptName !== "") {
    scope.add("info", here, "스크립트 이름은 엔진만 확인할 수 있다 (정의 파일의 scripts)");
  }
  checkUnknownKeys(
    cmd,
    ["code", ...spec.args.map((a) => a.name), ...spec.lists.map((l) => l.name)],
    here,
    "인자",
    scope,
  );
  for (const l of spec.lists) {
    const value = field(cmd, l.name);
    if (value === undefined) continue;
    checkArrayTail(value, `${here}.${l.name}`, scope);
    const lists = asList(value);
    if (!lists) continue;
    if (!l.perOption) checkListEditor(lists, `${here}.${l.name}`, scope);
    else
      lists.forEach((branch, b) => {
        const branchList = asList(branch);
        if (branchList) {
          checkArrayTail(branch, `${here}.${l.name}[${b + 1}]`, scope);
          checkListEditor(branchList, `${here}.${l.name}[${b + 1}]`, scope);
        }
      });
  }
}

function checkListEditor(list: readonly unknown[], prefix: string, scope: EditorScope): void {
  const { schema } = scope.ctx;
  let endedBy: CommandSpec | null = null;
  for (let j = 0; j < engineLength(list); j++) {
    const cmd = list[j];
    const here = `${prefix}[${j + 1}]`;
    if (endedBy) {
      scope.add("warning", here, `${endedBy.label} 뒤의 커맨드는 실행되지 않는다`);
      endedBy = null;
    }
    if (!isPlainObject(cmd)) continue;
    const spec = commandSpec(schema, cmd.code);
    if (!spec) continue;
    checkCommandEditor(cmd, here, spec, scope);
    if (spec.ends) endedBy = spec;
  }
}

function checkEventEditor(ev: JsonObject, i: number, scope: EditorScope, cells: Map<string, number>, autoCount: { n: number }): void {
  const { ctx } = scope;
  const { schema, map } = ctx;
  const here = `events[${i + 1}]`;
  const x = field(ev, "x");
  const y = field(ev, "y");
  const trigger = field(ev, "trigger") ?? TRIGGER_DEFAULT;
  const hasCell = isNonNegInt(x) && isNonNegInt(y);
  const inMap = hasCell && (!map || (x < map.width && y < map.height));
  if (map && hasCell) {
    if (x >= map.width) scope.add("error", `${here}.x`, `맵 밖이다 (가로 ${map.width} 칸)`);
    if (y >= map.height) scope.add("error", `${here}.y`, `맵 밖이다 (세로 ${map.height} 칸)`);
  }
  if (hasCell && (trigger === "action" || trigger === "touch")) {
    const key = `${String(trigger)}:${cellText(x, y)}`;
    const first = cells.get(key);
    if (first !== undefined) scope.add("error", here, `events[${first}] 와 같은 칸(${cellText(x, y)})의 ${String(trigger)} 이벤트다 (엔진은 먼저 놓인 것만 집는다)`);
    else cells.set(key, i + 1);
  }
  if (map && inMap && trigger === "touch" && map.collision && (map.collision[y * map.width + x] ?? 0) !== 0) {
    scope.add("warning", here, "touch 이벤트가 막힌 칸에 있다 (밟을 수 없다)");
  }
  const charset = field(ev, "charset");
  if (charset !== undefined) {
    checkUnknownKeys(charset, REF_KEYS, `${here}.charset`, "칸", scope);
    checkFile(field(charset, "file"), `${here}.charset.file`, ["png"], scope);
  }
  const wander = field(ev, "wander");
  if (wander !== undefined && isObjectPlace(wander)) {
    if (charset === undefined) scope.add("warning", `${here}.wander`, "외형이 없으면 배회하지 않는다");
    checkUnknownKeys(wander, WANDER_KEYS, `${here}.wander`, "칸", scope);
    const area = field(wander, "area");
    if (isObjectPlace(area)) {
      checkUnknownKeys(area, AREA_KEYS, `${here}.wander.area`, "칸", scope);
      const [ax, ay, aw, ah] = ["x", "y", "w", "h"].map((k) => field(area, k));
      if (isNonNegInt(ax) && isNonNegInt(ay) && isInteger(aw) && isInteger(ah) && aw >= 1 && ah >= 1) {
        if (map && (ax + aw > map.width || ay + ah > map.height)) scope.add("warning", `${here}.wander.area`, "배회 구역이 맵 밖으로 나간다");
        if (hasCell && (x < ax || x >= ax + aw || y < ay || y >= ay + ah)) scope.add("warning", `${here}.wander.area`, "이벤트가 제 배회 구역 밖에 있다 (구역 안의 칸으로만 걷는다)");
      }
    }
  }
  const id = field(ev, "id");
  if (typeof id === "string" && ctx.defIds?.has(id)) scope.add("warning", `${here}.id`, `정의 파일에 같은 id ${id} 가 있다. 게임에서는 Lua 정의가 이긴다`);
  if (trigger === "auto") {
    autoCount.n++;
    scope.add("info", `${here}.trigger`, `맵에 들어올 때 병합 순서대로 하나씩 돈다. 이 맵의 auto 중 ${autoCount.n}번째`);
  }
  checkUnknownKeys(
    ev,
    schema.fields.map((f) => f.name),
    here,
    "이벤트 칸",
    scope,
  );
  const commands = field(ev, "commands");
  if (commands !== undefined) {
    checkArrayTail(commands, `${here}.commands`, scope);
    const list = asList(commands);
    if (list) {
      checkListEditor(list, `${here}.commands`, scope);
      for (const dup of findDuplicateBlocks(list, schema)) {
        const places = dup.places.map((p) => `${here}${placeSuffix(p)}`);
        scope.add("info", places[0], `같은 커맨드 묶음(${dup.size}개)이 이 이벤트에 ${places.length}번 있다: ${places.join(", ")}. 한쪽만 고치면 어긋난다`);
      }
    }
  }
}

/** 이벤트 목록 전체. 엔진과 같은 검사 뒤에 에디터만의 검사를 붙인다 */
export function validateEvents(events: unknown, ctx: ValidateContext): EventProblem[] {
  const out: EventProblem[] = [];
  const list = events === undefined || events === null ? [] : asList(events);
  const idAt = (i: number | undefined) => {
    if (i === undefined || !list) return undefined;
    const id = field(list[i], "id");
    return typeof id === "string" ? id : undefined;
  };
  const push = (severity: Severity, source: "engine" | "editor", location: string, message: string) => {
    const eventIndex = eventIndexOf(location);
    const p: EventProblem = { severity, message, location, source };
    if (eventIndex !== undefined) {
      p.eventIndex = eventIndex;
      const id = idAt(eventIndex);
      if (id !== undefined) p.eventId = id;
    }
    out.push(p);
  };
  for (const p of engineProblems(events, ctx.schema)) push("error", "engine", p.path, p.message);
  if (!list) return out;

  const ids = new Set<string>();
  const hasCharset = new Map<string, boolean>();
  for (const ev of list) {
    const id = field(ev, "id");
    if (typeof id === "string" && id !== "") {
      ids.add(id);
      if (!hasCharset.has(id)) hasCharset.set(id, field(ev, "charset") !== undefined);
    }
  }
  const scope: EditorScope = { ctx, ids, hasCharset, add: (severity, path, message) => push(severity, "editor", path, message) };
  checkArrayTail(events, "events", scope);
  const cells = new Map<string, number>();
  const autoCount = { n: 0 };
  for (let i = 0; i < engineLength(list); i++) {
    const ev = list[i];
    if (isPlainObject(ev)) checkEventEditor(ev, i, scope, cells, autoCount);
  }
  return out;
}

/** 오류가 있는가 */
export function hasErrors(problems: readonly EventProblem[]): boolean {
  return problems.some((p) => p.severity === "error");
}

/**
 * 정의 파일(Lua)에서 이벤트 id 를 어림으로 찾는다: id = "..." 꼴만. 확실한 확인은 실행할 때 엔진이 찍는
 * rpg:override:<id> 줄이다
 */
export function defFileIds(luaText: string): Set<string> {
  const out = new Set<string>();
  const re = /\bid\s*=\s*(["'])((?:\\.|(?!\1).)*)\1/g;
  for (const line of luaText.split("\n")) {
    const code = line.replace(/--.*$/, "");
    for (const m of code.matchAll(re)) out.add(m[2]);
  }
  return out;
}
