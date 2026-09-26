// 커맨드 트리: 경로, 엔진 표기, 걷기, 넣기, 빼기, 옮기기, 복사, 같은 하위 목록 찾기.
//
// 커맨드 목록은 중첩이다. if 는 thenDo 와 elseDo, choice 는 항목마다 가지(branches[k])를 품는다.
// 경로는 0부터 세는 구조로 들고, 사람에게 보일 때만 엔진과 같은 1부터 세는 표기로 바꾼다:
//
//   { list: [{ at: 1, list: "branches", branch: 0 }], index: 2 }  →  events[4].commands[2].branches[1][3]
//
// 모든 함수는 원본을 고치지 않고 바뀐 길만 새로 만든 목록을 돌려준다 (손대지 않은 커맨드는 같은 객체다).

import { asList, cloneJson, engineLength, isPlainObject, stableKey, type JsonObject } from "./json";
import { commandSpec, type EventSchema, type ListSpec } from "./schema";
import { orderCommand } from "./events";

/** 목록 하나 안으로 들어가는 걸음: at 번째 커맨드의 list 목록 (perOption 이면 branch 번째 가지) */
export interface ListStep {
  at: number;
  list: string;
  branch?: number;
}

/** 이벤트의 commands 에서 하위 목록까지. 빈 배열이면 commands 자체 */
export type ListPath = readonly ListStep[];

export interface CommandPath {
  list: ListPath;
  index: number;
}

export const ROOT_LIST: ListPath = [];

export class TreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreeError";
  }
}

/** 커맨드 아래의 목록 경로 */
export function childList(path: CommandPath, list: string, branch?: number): ListPath {
  const step: ListStep = branch === undefined ? { at: path.index, list } : { at: path.index, list, branch };
  return [...path.list, step];
}

// ---- 엔진 표기 ----

function stepText(step: ListStep): string {
  return `[${step.at + 1}].${step.list}${step.branch === undefined ? "" : `[${step.branch + 1}]`}`;
}

/** ".commands[2].branches[1]" 꼴 (이벤트 뒤에 붙는 부분) */
export function listSuffix(list: ListPath): string {
  return `.commands${list.map(stepText).join("")}`;
}

export function commandSuffix(path: CommandPath): string {
  return `${listSuffix(path.list)}[${path.index + 1}]`;
}

/** events[4].commands[2].branches[1] */
export function listLocation(eventIndex: number, list: ListPath): string {
  return `events[${eventIndex + 1}]${listSuffix(list)}`;
}

/** events[4].commands[2].branches[1][3] */
export function commandLocation(eventIndex: number, path: CommandPath): string {
  return `events[${eventIndex + 1}]${commandSuffix(path)}`;
}

/**
 * 엔진 표기를 경로로 (rpg:error 줄이나 문제 목록에서 그 커맨드로 가기). command 는 닿은 가장 깊은 커맨드이고
 * rest 는 그 뒤에 남은 글이다 (".text", ".branches[2]" 꼴). 커맨드까지 닿지 못하면 command 가 null 이다
 */
export function parseLocation(text: string, schema: EventSchema): { eventIndex: number; command: CommandPath | null; rest: string } | null {
  const head = /^events\[(\d+)\]/.exec(text);
  if (!head) return null;
  const eventIndex = Number(head[1]) - 1;
  const afterHead = text.slice(head[0].length);
  if (!afterHead.startsWith(".commands[")) return { eventIndex, command: null, rest: afterHead };
  const perOption = new Map<string, boolean>();
  for (const c of schema.commands) for (const l of c.lists) perOption.set(l.name, perOption.get(l.name) === true || l.perOption !== undefined);
  const list: ListStep[] = [];
  let command: CommandPath | null = null;
  let rest = afterHead.slice(".commands".length);
  for (;;) {
    const m = /^\[(\d+)\]/.exec(rest);
    if (!m) break;
    command = { list: [...list], index: Number(m[1]) - 1 };
    rest = rest.slice(m[0].length);
    const sub = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
    if (!sub || !perOption.has(sub[1])) break;
    let after = rest.slice(sub[0].length);
    let step: ListStep = { at: command.index, list: sub[1] };
    if (perOption.get(sub[1])) {
      const b = /^\[(\d+)\]/.exec(after);
      if (!b) break;
      step = { ...step, branch: Number(b[1]) - 1 };
      after = after.slice(b[0].length);
    }
    // 목록 자리 자체를 가리키면 그 목록을 품은 커맨드에 머문다
    if (!/^\[\d+\]/.test(after)) break;
    list.push(step);
    rest = after;
  }
  return { eventIndex, command, rest };
}

// ---- 읽기 ----

function listSpecOf(cmd: unknown, name: string, schema: EventSchema): ListSpec | undefined {
  if (!isPlainObject(cmd)) return undefined;
  return commandSpec(schema, cmd.code)?.lists.find((l) => l.name === name);
}

/** 목록 경로의 목록. 중간에 배열이 아닌 자리가 있으면 undefined (없는 하위 목록은 빈 배열) */
export function getList(commands: unknown, list: ListPath, schema: EventSchema): readonly unknown[] | undefined {
  let current: readonly unknown[] | undefined = commands === undefined || commands === null ? [] : asList(commands);
  for (const step of list) {
    if (!current) return undefined;
    const cmd = current[step.at];
    const spec = listSpecOf(cmd, step.list, schema);
    if (!spec || !isPlainObject(cmd)) return undefined;
    const value = cmd[step.list];
    if (value === undefined || value === null) {
      current = [];
      continue;
    }
    const lists = asList(value);
    if (!lists) return undefined;
    if (spec.perOption) {
      if (step.branch === undefined) return undefined;
      const branch = lists[step.branch];
      current = branch === undefined || branch === null ? [] : asList(branch);
    } else {
      current = lists;
    }
  }
  return current;
}

export function getCommand(commands: unknown, path: CommandPath, schema: EventSchema): unknown {
  return getList(commands, path.list, schema)?.[path.index];
}

/** 커맨드가 품은 하위 목록들 (스키마 순서, perOption 은 가지마다). 배열이 아닌 자리는 value 만 준다 */
export function subLists(cmd: unknown, schema: EventSchema): Array<{ list: string; branch?: number; value: unknown; items: readonly unknown[] | undefined }> {
  if (!isPlainObject(cmd)) return [];
  const spec = commandSpec(schema, cmd.code);
  if (!spec) return [];
  const out: Array<{ list: string; branch?: number; value: unknown; items: readonly unknown[] | undefined }> = [];
  for (const l of spec.lists) {
    const value = cmd[l.name];
    if (value === undefined || value === null) continue;
    const lists = asList(value);
    if (!l.perOption || !lists) {
      out.push({ list: l.name, value, items: lists });
      continue;
    }
    for (let b = 0; b < engineLength(lists); b++) {
      out.push({ list: l.name, branch: b, value: lists[b], items: asList(lists[b]) });
    }
  }
  return out;
}

/**
 * 적힌 순서대로 하위 목록까지 훑는다 (엔진 Commands.walk 와 같다: 객체인 커맨드만, 배열인 하위 목록만).
 * visit 가 false 를 돌려주면 그 커맨드 아래로 들어가지 않는다
 */
export function walkCommands(commands: unknown, schema: EventSchema, visit: (cmd: JsonObject, path: CommandPath) => void | false, list: ListPath = ROOT_LIST): void {
  const items = commands === undefined || commands === null ? [] : asList(commands);
  if (!items) return;
  for (let i = 0; i < engineLength(items); i++) {
    const cmd = items[i];
    if (!isPlainObject(cmd)) continue;
    const path = { list, index: i };
    if (visit(cmd, path) === false) continue;
    for (const sub of subLists(cmd, schema)) {
      if (sub.items) walkCommands(sub.items, schema, visit, childList(path, sub.list, sub.branch));
    }
  }
}

// ---- 고치기 ----

/** 목록 경로의 목록을 fn 으로 바꾼 새 commands. 없는 하위 목록은 만든다 (가지는 항목 수까지 빈 가지로 채운다) */
export function updateList(commands: unknown, list: ListPath, schema: EventSchema, fn: (items: unknown[]) => unknown[]): unknown[] {
  const items = commands === undefined || commands === null ? [] : asList(commands);
  if (!items) throw new TreeError("커맨드 목록이 배열이 아니다");
  if (list.length === 0) return fn([...items]);
  const [step, ...rest] = list;
  const cmd = items[step.at];
  if (!isPlainObject(cmd)) throw new TreeError(`${step.at + 1} 번째 커맨드가 객체가 아니다`);
  const spec = listSpecOf(cmd, step.list, schema);
  if (!spec) throw new TreeError(`${String(cmd.code)} 에는 ${step.list} 목록이 없다`);
  const had = Object.prototype.hasOwnProperty.call(cmd, step.list) && cmd[step.list] !== null && cmd[step.list] !== undefined;
  let nextValue: unknown;
  if (spec.perOption) {
    if (step.branch === undefined || step.branch < 0) throw new TreeError(`${step.list} 는 가지 번호가 필요하다`);
    const lists = had ? asList(cmd[step.list]) : [];
    if (!lists) throw new TreeError(`${step.list} 가 배열이 아니다`);
    const options = asList(cmd[spec.perOption]) ?? [];
    const size = Math.max(lists.length, step.branch + 1, had ? 0 : engineLength(options));
    const nextLists: unknown[] = [];
    for (let b = 0; b < size; b++) {
      const branch = lists[b];
      if (b === step.branch) {
        if (branch !== undefined && branch !== null && !asList(branch)) throw new TreeError(`${step.list}[${b + 1}] 가 배열이 아니다`);
        nextLists.push(updateList(branch, rest, schema, fn));
      } else {
        nextLists.push(branch === undefined || branch === null ? [] : branch);
      }
    }
    nextValue = nextLists;
  } else {
    if (had && !asList(cmd[step.list])) throw new TreeError(`${step.list} 가 배열이 아니다`);
    nextValue = updateList(had ? cmd[step.list] : [], rest, schema, fn);
  }
  // 있던 키는 자리를 지키고, 새로 생긴 키는 정해진 순서에 끼운다
  const nextCmd = had ? { ...cmd, [step.list]: nextValue } : orderCommand({ ...cmd, [step.list]: nextValue }, schema);
  const out = [...items];
  out[step.at] = nextCmd;
  return out;
}

function checkIndex(n: number, max: number, what: string): void {
  if (!Number.isInteger(n) || n < 0 || n > max) throw new TreeError(`${what} 가 목록 밖이다 (${n})`);
}

/** index 자리에 커맨드들을 넣는다 */
export function insertCommands(commands: unknown, list: ListPath, index: number, added: readonly unknown[], schema: EventSchema): unknown[] {
  return updateList(commands, list, schema, (items) => {
    checkIndex(index, items.length, "넣을 자리");
    items.splice(index, 0, ...added);
    return items;
  });
}

/** index 부터 count 개를 뺀다 */
export function removeCommands(commands: unknown, list: ListPath, index: number, count: number, schema: EventSchema): unknown[] {
  return updateList(commands, list, schema, (items) => {
    checkIndex(index, items.length - 1, "뺄 자리");
    if (!Number.isInteger(count) || count < 1 || index + count > items.length) throw new TreeError(`뺄 개수가 틀렸다 (${count})`);
    items.splice(index, count);
    return items;
  });
}

/** 커맨드 하나를 바꾼다 */
export function replaceCommand(commands: unknown, path: CommandPath, next: unknown, schema: EventSchema): unknown[] {
  return updateList(commands, path.list, schema, (items) => {
    checkIndex(path.index, items.length - 1, "바꿀 자리");
    items[path.index] = next;
    return items;
  });
}

/** a 가 b 와 같거나 b 안의 목록인가 */
export function isInside(a: ListPath, b: ListPath): boolean {
  if (a.length < b.length) return false;
  return b.every((s, i) => s.at === a[i].at && s.list === a[i].list && s.branch === a[i].branch);
}

/**
 * from 에서 count 개를 떼어 to 목록의 index 자리(떼기 전 기준)에 넣는다.
 * 옮기는 커맨드 안으로는 옮길 수 없다
 */
export function moveCommands(commands: unknown, from: CommandPath, count: number, to: { list: ListPath; index: number }, schema: EventSchema): unknown[] {
  const source = getList(commands, from.list, schema);
  if (!source) throw new TreeError("옮길 목록이 없다");
  checkIndex(from.index, source.length - 1, "옮길 자리");
  if (!Number.isInteger(count) || count < 1 || from.index + count > source.length) throw new TreeError(`옮길 개수가 틀렸다 (${count})`);
  // 옮기는 커맨드의 하위 목록 안으로 가려 하면 거절한다
  const depth = from.list.length;
  if (to.list.length > depth && isInside(to.list.slice(0, depth), from.list)) {
    const at = to.list[depth].at;
    if (at >= from.index && at < from.index + count) throw new TreeError("커맨드를 제 안으로 옮길 수 없다");
  }
  const moving = source.slice(from.index, from.index + count);
  const sameList = to.list.length === from.list.length && isInside(to.list, from.list);
  if (sameList) {
    return updateList(commands, from.list, schema, (items) => {
      checkIndex(to.index, items.length, "옮길 곳");
      items.splice(from.index, count);
      const at = to.index > from.index ? Math.max(from.index, to.index - count) : to.index;
      items.splice(at, 0, ...moving);
      return items;
    });
  }
  // 다른 목록: 떼어 낸 뒤 목적지 경로가 앞 형제의 수만큼 당겨질 수 있다
  const removed = removeCommands(commands, from.list, from.index, count, schema);
  const target = to.list.map((s) => ({ ...s }));
  if (target.length > from.list.length && isInside(target.slice(0, from.list.length), from.list)) {
    const step = target[from.list.length];
    if (step.at >= from.index + count) step.at -= count;
  }
  return insertCommands(removed, target, to.index, moving, schema);
}

/** 복사 (클립보드용 깊은 사본) */
export function copyCommands(commands: unknown, list: ListPath, index: number, count: number, schema: EventSchema): unknown[] {
  const items = getList(commands, list, schema);
  if (!items) throw new TreeError("복사할 목록이 없다");
  checkIndex(index, items.length - 1, "복사할 자리");
  return cloneJson(items.slice(index, index + count));
}

// ---- 같은 묶음 찾기 ----
//
// 이전 도구는 정의 파일의 지역 함수(departure(), handKey())를 쓰인 자리마다 펼쳤다. 한쪽만 고치면 두 벌이 어긋나므로
// 인스펙터가 "같은 커맨드 묶음이 이 이벤트에 두 번 있다"를 알린다. 묶음은 둘 중 하나다:
//   하위 목록 전체 (커맨드 둘 이상)          예: 배의 두 선택지 가지에 펼친 departure()
//   하위 목록을 품은 커맨드 하나 (내용 있음)  예: 여관 주인의 두 목록에 펼친 handKey()
// 다른 묶음 안에 든 묶음은 바깥 것만 알린다.

export type BlockPlace = { kind: "list"; list: ListPath } | { kind: "command"; path: CommandPath };

export interface DuplicateBlock {
  /** 묶음의 커맨드 수 (하위 목록 포함) */
  size: number;
  places: BlockPlace[];
}

function countCommands(v: unknown, schema: EventSchema): number {
  let n = 0;
  walkCommands(Array.isArray(v) ? v : [v], schema, () => {
    n++;
  });
  return n;
}

export function placeSuffix(place: BlockPlace): string {
  return place.kind === "list" ? listSuffix(place.list) : commandSuffix(place.path);
}

export function findDuplicateBlocks(commands: unknown, schema: EventSchema): DuplicateBlock[] {
  const groups = new Map<string, { size: number; places: BlockPlace[] }>();
  const add = (key: string, value: unknown, place: BlockPlace) => {
    let g = groups.get(key);
    if (!g) {
      g = { size: countCommands(value, schema), places: [] };
      groups.set(key, g);
    }
    g.places.push(place);
  };
  walkCommands(commands, schema, (cmd, path) => {
    const subs = subLists(cmd, schema);
    if (subs.some((s) => s.items && engineLength(s.items) > 0)) add(`c:${stableKey(cmd)}`, cmd, { kind: "command", path });
    for (const s of subs) {
      if (s.items && engineLength(s.items) >= 2) add(`l:${stableKey(s.items)}`, s.items, { kind: "list", list: childList(path, s.list, s.branch) });
    }
  });
  const found = [...groups.values()].filter((g) => g.places.length >= 2).sort((a, b) => b.size - a.size);
  const kept: DuplicateBlock[] = [];
  const covered: string[] = [];
  const inside = (text: string) => covered.some((c) => text !== c && text.startsWith(c) && (text[c.length] === "[" || text[c.length] === "."));
  for (const g of found) {
    const places = g.places.filter((p) => !inside(placeSuffix(p)));
    if (places.length < 2) continue;
    kept.push({ size: g.size, places });
    for (const p of places) covered.push(placeSuffix(p));
  }
  return kept;
}
