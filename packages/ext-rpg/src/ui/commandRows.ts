// 커맨드 목록 편집기의 줄 (DOM 없음). 트리를 보이는 줄로 펴고, 요약 글과 머리줄 이름을 만들고, 문제를 줄에 붙인다.
//
// 줄은 셋이다.
//   command  커맨드 하나. 키는 "c" + 엔진 표기의 뒷부분 (c.commands[2].thenDo[1])
//   header   하위 목록의 머리줄 (참이면, 아니면, 1. 떠난다). 접을 수 있다. 키는 "h" + 목록 표기
//   end      목록 끝의 빈 줄. 여기서 넣으면 목록 끝에 붙는다 (빈 하위 목록에도 넣을 수 있다). 키는 "e" + 목록 표기

import { asList, engineLength, field, isArrayPlace, isPlainObject, type JsonObject } from "../model/json";
import { commandSpec, judgedCondition, type ArgSpec, type CommandSpec, type EventSchema } from "../model/schema";
import { childList, commandSuffix, listSuffix, parseLocation, type CommandPath, type ListPath } from "../model/tree";
import type { EventProblem } from "../model/validate";

export interface CommandRow {
  kind: "command";
  key: string;
  path: CommandPath;
  depth: number;
  cmd: unknown;
  spec: CommandSpec | undefined;
  label: string;
  summary: string;
}

export interface HeaderRow {
  kind: "header";
  key: string;
  list: ListPath;
  depth: number;
  label: string;
  folded: boolean;
  /** 목록의 커맨드 수 */
  count: number;
  /** 배열이 아니라 열 수 없는 목록 */
  broken: boolean;
}

export interface EndRow {
  kind: "end";
  key: string;
  list: ListPath;
  depth: number;
  /** 넣을 자리 (목록 길이) */
  index: number;
}

export type TreeRow = CommandRow | HeaderRow | EndRow;

export const commandKey = (path: CommandPath): string => `c${commandSuffix(path)}`;
export const headerKey = (list: ListPath): string => `h${listSuffix(list)}`;
export const endKey = (list: ListPath): string => `e${listSuffix(list)}`;

const SUMMARY_MAX = 80;

function clip(text: string, max = SUMMARY_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function baseName(path: string): string {
  return path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
}

/** 조건 한 줄: "아이템 shell >= 2", "깃발 arrived = false". 꼴이 없으면 늘 참이다 */
export function conditionSummary(schema: EventSchema, cond: unknown): string {
  if (!isPlainObject(cond)) return "빈 조건 (늘 참)";
  const kind = judgedCondition(schema, cond);
  if (!kind) return "빈 조건 (늘 참)";
  const parts = [kind.label, valueText(kind.args[0], field(cond, kind.args[0].name), schema)];
  const hasOp = kind.args.some((a) => a.type === "enum");
  for (const a of kind.args.slice(1)) {
    const v = field(cond, a.name);
    if (v === undefined) continue;
    parts.push(hasOp || a.type === "enum" ? valueText(a, v, schema) : `= ${valueText(a, v, schema)}`);
  }
  return parts.join(" ");
}

/** 인자 값 하나를 요약에 쓸 글로 */
export function valueText(arg: ArgSpec | undefined, v: unknown, schema: EventSchema): string {
  if (v === undefined || v === null) return "";
  switch (arg?.type) {
    case "text":
    case "string": {
      if (typeof v !== "string") break;
      const lines = v.split("\n");
      return lines.length > 1 ? `${lines[0]} …` : v;
    }
    case "options":
    case "route": {
      const list = asList(v);
      return list ? list.map((x) => String(x)).join(arg.type === "options" ? " / " : ", ") : JSON.stringify(v);
    }
    case "condition":
      return conditionSummary(schema, v);
    case "face":
    case "charset": {
      const name = field(v, "set") ?? (typeof field(v, "file") === "string" ? baseName(field(v, "file") as string) : undefined);
      const index = field(v, "index");
      return `${String(name ?? "?")}${index === undefined ? "" : ` ${String(index)}번`}`;
    }
    case "file":
      return typeof v === "string" ? baseName(v) : JSON.stringify(v);
    case "json":
      return JSON.stringify(v);
  }
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * 요약 틀 "{name}: {text}" 을 채운다. 없는 인자의 자리는 옆의 구분 글과 함께 뺀다
 * (이름 없는 대사는 "대사" 만, 대사 없는 이름은 "이름" 만)
 */
export function fillSummary(template: string, value: (name: string) => string): string {
  const parts = template.split(/(\{[A-Za-z_][A-Za-z0-9_]*\})/);
  // 짝수 자리는 글, 홀수 자리는 이름
  const filled = parts.map((p, i) => (i % 2 === 1 ? value(p.slice(1, -1)) : p));
  const keep = parts.map(() => true);
  for (let i = 1; i < parts.length; i += 2) {
    if (filled[i] !== "") continue;
    keep[i] = false;
    // 첫 자리면 뒤의 글을, 아니면 앞의 글을 뺀다
    const firstPlaceholder = !keep.slice(1, i).some((k, j) => k && (j + 1) % 2 === 1);
    if (firstPlaceholder && i + 1 < parts.length) keep[i + 1] = false;
    else if (i - 1 >= 0) keep[i - 1] = false;
  }
  return filled.filter((_, i) => keep[i]).join("").trim();
}

/** 줄의 요약. 스키마의 summary, 없으면 첫 필수 인자 (없으면 첫 인자) */
export function commandSummary(schema: EventSchema, cmd: unknown): string {
  if (!isPlainObject(cmd)) return cmd === null ? "null" : JSON.stringify(cmd) ?? "";
  const spec = commandSpec(schema, cmd.code);
  if (!spec) return clip(JSON.stringify(cmd));
  const text = (name: string) => {
    const arg = spec.args.find((a) => a.name === name);
    return valueText(arg, field(cmd, name), schema);
  };
  if (spec.summary) return clip(fillSummary(spec.summary, text));
  const first = spec.args.find((a) => a.required && field(cmd, a.name) !== undefined) ?? spec.args.find((a) => field(cmd, a.name) !== undefined);
  return first ? clip(text(first.name)) : "";
}

/** 줄 머리의 이름 */
export function commandLabel(schema: EventSchema, cmd: unknown): string {
  if (!isPlainObject(cmd)) return "커맨드가 아니다";
  const spec = commandSpec(schema, cmd.code);
  return spec ? spec.label : `알 수 없는 커맨드 ${String(cmd.code)}`;
}

/** 가지 머리줄 이름: "{n}. {option}" 틀 */
export function branchLabel(template: string, n: number, option: unknown): string {
  const text = typeof option === "string" ? option : option === undefined ? "(항목 없음)" : JSON.stringify(option);
  return template.replace(/\{n\}/g, String(n)).replace(/\{option\}/g, text);
}

/** 트리를 보이는 줄로 편다. folded 는 접힌 머리줄 키 */
export function buildRows(commands: unknown, schema: EventSchema, folded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const items = commands === undefined || commands === null ? [] : asList(commands);
  if (!items) return rows;
  addList(rows, items, [], 0, schema, folded);
  return rows;
}

function addList(rows: TreeRow[], items: readonly unknown[], list: ListPath, depth: number, schema: EventSchema, folded: ReadonlySet<string>): void {
  items.forEach((cmd, index) => {
    const path: CommandPath = { list, index };
    const spec = isPlainObject(cmd) ? commandSpec(schema, cmd.code) : undefined;
    rows.push({ kind: "command", key: commandKey(path), path, depth, cmd, spec, label: commandLabel(schema, cmd), summary: commandSummary(schema, cmd) });
    if (spec && isPlainObject(cmd)) addSubLists(rows, cmd, spec, path, depth + 1, schema, folded);
  });
  rows.push({ kind: "end", key: endKey(list), list, depth, index: items.length });
}

function addHeader(rows: TreeRow[], list: ListPath, depth: number, label: string, value: unknown, schema: EventSchema, folded: ReadonlySet<string>): void {
  const broken = value !== undefined && !isArrayPlace(value);
  const items = broken ? [] : (asList(value) ?? []);
  const key = headerKey(list);
  const isFolded = folded.has(key);
  rows.push({ kind: "header", key, list, depth, label, folded: isFolded, count: engineLength(items), broken });
  if (!broken && !isFolded) addList(rows, items, list, depth + 1, schema, folded);
}

function addSubLists(rows: TreeRow[], cmd: JsonObject, spec: CommandSpec, path: CommandPath, depth: number, schema: EventSchema, folded: ReadonlySet<string>): void {
  for (const l of spec.lists) {
    const value = field(cmd, l.name);
    if (!l.perOption) {
      addHeader(rows, childList(path, l.name), depth, l.label, value, schema, folded);
      continue;
    }
    const options = asList(field(cmd, l.perOption)) ?? [];
    if (value !== undefined && !isArrayPlace(value)) {
      // 가지 목록 전체가 배열이 아니다: 첫 가지 자리에 고칠 수 없는 머리줄 하나
      rows.push({ kind: "header", key: headerKey(childList(path, l.name, 0)), list: childList(path, l.name, 0), depth, label: l.name, folded: false, count: 0, broken: true });
      continue;
    }
    const branches = value === undefined ? [] : (asList(value) ?? []);
    const n = Math.max(engineLength(options), engineLength(branches));
    for (let b = 0; b < n; b++) {
      addHeader(rows, childList(path, l.name, b), depth, branchLabel(l.label, b + 1, options[b]), branches[b] ?? undefined, schema, folded);
    }
  }
}

// ---- 문제 ----

/** 이 이벤트의 커맨드 목록 안의 문제인가 */
export function isCommandProblem(p: EventProblem, eventIndex: number): boolean {
  const head = `events[${eventIndex + 1}].commands`;
  return p.location === head || p.location.startsWith(`${head}[`) || p.location.startsWith(`${head}.`);
}

/** 경로의 커맨드와 그 조상들의 줄 키 (가까운 것부터) */
export function ancestorKeys(path: CommandPath): string[] {
  const out = [commandKey(path)];
  for (let k = path.list.length; k >= 1; k--) {
    const list = path.list.slice(0, k);
    out.push(headerKey(list));
    out.push(commandKey({ list: path.list.slice(0, k - 1), index: path.list[k - 1].at }));
  }
  return out;
}

/** 문제 하나를 가리키는 커맨드 경로. 커맨드까지 닿지 못하면 null */
export function problemPath(p: EventProblem, schema: EventSchema): CommandPath | null {
  return parseLocation(p.location, schema)?.command ?? null;
}

/** 문제를 보이는 줄에 붙인다. 접혀 숨은 커맨드의 문제는 그것을 숨긴 머리줄에 */
export function problemsByRow(problems: readonly EventProblem[], rows: readonly TreeRow[], schema: EventSchema): Map<string, EventProblem[]> {
  const visible = new Set(rows.map((r) => r.key));
  const out = new Map<string, EventProblem[]>();
  for (const p of problems) {
    const path = problemPath(p, schema);
    if (!path) continue;
    const key = ancestorKeys(path).find((k) => visible.has(k));
    if (!key) continue;
    const list = out.get(key) ?? [];
    list.push(p);
    out.set(key, list);
  }
  return out;
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** 가장 무거운 등급 */
export function worstSeverity(problems: readonly EventProblem[]): EventProblem["severity"] | null {
  let worst: EventProblem["severity"] | null = null;
  for (const p of problems) if (worst === null || SEVERITY_ORDER[p.severity] < SEVERITY_ORDER[worst]) worst = p.severity;
  return worst;
}

// ---- 고르기와 넣을 자리 ----

export function sameList(a: ListPath, b: ListPath): boolean {
  return a.length === b.length && a.every((s, i) => s.at === b[i].at && s.list === b[i].list && s.branch === b[i].branch);
}

export interface Range {
  list: ListPath;
  start: number;
  count: number;
}

/** 고른 커맨드들: 커서와 닻이 같은 목록의 커맨드면 그 사이 전부, 아니면 커서 하나. 커맨드 줄이 아니면 null */
export function selectedRange(cursor: TreeRow | undefined, anchor: TreeRow | undefined): Range | null {
  if (!cursor || cursor.kind !== "command") return null;
  if (anchor && anchor.kind === "command" && sameList(anchor.path.list, cursor.path.list)) {
    const start = Math.min(anchor.path.index, cursor.path.index);
    return { list: cursor.path.list, start, count: Math.abs(anchor.path.index - cursor.path.index) + 1 };
  }
  return { list: cursor.path.list, start: cursor.path.index, count: 1 };
}

export type InsertWhere = "above" | "below";

/** 넣을 자리. 머리줄은 그 목록의 처음, 끝 줄은 그 목록의 끝 */
export function insertTarget(cursor: TreeRow | undefined, range: Range | null, where: InsertWhere): { list: ListPath; index: number } {
  if (!cursor) return { list: [], index: 0 };
  if (cursor.kind === "end") return { list: cursor.list, index: cursor.index };
  if (cursor.kind === "header") return { list: cursor.list, index: 0 };
  const r = range ?? { list: cursor.path.list, start: cursor.path.index, count: 1 };
  return { list: r.list, index: where === "above" ? r.start : r.start + r.count };
}

/** 커맨드 경로가 숨지 않게 펼쳐야 하는 머리줄 키 */
export function headersAbove(path: CommandPath): string[] {
  const out: string[] = [];
  for (let k = 1; k <= path.list.length; k++) out.push(headerKey(path.list.slice(0, k)));
  return out;
}
