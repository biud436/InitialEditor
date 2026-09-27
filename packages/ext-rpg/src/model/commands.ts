// 이벤트 편집 명령 (docs/plans/e5-rpg.md 3절, 4절). 맵 문서의 되돌리기 스택(doc.apply)에 그대로 넣는다.
//
// 명령은 섹션의 목록을 앞뒤로 통째로 든다 (바뀐 길만 새 객체라 싸다). 되돌리기는 앞 목록을 다시 넣는 것이다.
// mergeKey 가 같은 연속 명령은 하나로 합쳐진다: 한 번의 끌기, 칸 하나의 타이핑이 되돌리기 한 단계다.
//
// 막는 것: 편집 뒤에 새 오류가 생기면(엔진이 그 이벤트를 건너뛸 값, 맵 밖, 같은 칸의 action 이나 touch,
// 겹치거나 예약된 id) 명령을 만들지 않고 EditRefused 를 던진다. 도구는 그 글을 띄운다. 밖에서 고친 파일에 원래 있던
// 오류는 막지 않는다 (고치는 편집까지 막으면 안 된다). 잠긴 레이어(스키마 버전, RTP 쌍둥이 맵)는 모든 편집을 막는다.

import type { Command } from "@initial-editor/core";
import { asList, cloneJson, field, hasOwn, isArrayPlace, isInteger, isJsonText, isNonNegInt, isObjectPlace, isPlainObject, jsonValueText, setOwn, type JsonObject } from "./json";
import { canonicalCommand, canonicalEvent, orderArea, orderCommand, orderEvent, orderRef, orderWander, type EventsSection } from "./events";
import { commandSpec, fieldSpec, type ArgSpec, type EventSchema } from "./schema";
import {
  getCommand,
  getList,
  insertCommands as treeInsert,
  moveCommands as treeMove,
  removeCommands as treeRemove,
  replaceCommand,
  TreeError,
  walkCommands,
  type CommandPath,
  type ListPath,
} from "./tree";
import { validateEvents, type EventProblem, type MapGeometry } from "./validate";
import type { Cell } from "./play";

export class EditRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditRefused";
  }
}

export interface EditContext {
  schema: EventSchema;
  map: MapGeometry;
  /** 편집을 막는 이유. 있으면 모든 편집을 거절한다 */
  locked?: string | null;
}

export interface EditOptions {
  /** 같은 키의 연속 명령은 하나로 합쳐진다 (끌기 한 번, 입력 칸 초점 한 번) */
  mergeKey?: string;
}

/** 이벤트 목록의 내용이 같은가: 칸마다 같은 객체이거나 키 순서까지 같은 JSON (저장할 글이 같다) */
function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i] || JSON.stringify(x) === JSON.stringify(b[i]));
}

/**
 * 섹션의 목록을 갈아 끼우는 명령. focus는 명령이 다룬 이벤트 번호 (새 이벤트를 고를 때 쓴다).
 * 목록의 내용이 그대로면 unchanged다: 문서의 스택이 쌓지 않아 이미 고른 외형을 다시 누르거나 같은 값을 넣어도 되돌리기 단계와 수정됨이 없다
 */
export class EventListCommand implements Command {
  readonly coalesceKey?: string;
  readonly unchanged: boolean;

  constructor(
    readonly label: string,
    private readonly section: EventsSection,
    private readonly before: readonly unknown[],
    private after: readonly unknown[],
    readonly focus: readonly number[],
    coalesceKey?: string,
  ) {
    if (coalesceKey !== undefined) this.coalesceKey = coalesceKey;
    this.unchanged = sameList(before, after);
  }

  execute(): void {
    this.section.replace(this.after);
  }

  undo(): void {
    this.section.replace(this.before);
  }

  merge(next: Command): boolean {
    if (!(next instanceof EventListCommand) || next.section !== this.section || next.coalesceKey !== this.coalesceKey) return false;
    this.after = next.after;
    return true;
  }
}

function errorKeys(problems: readonly EventProblem[]): Set<string> {
  return new Set(problems.filter((p) => p.severity === "error").map((p) => `${p.location}|${p.message}`));
}

/**
 * 스키마 기본값으로 필수 인자를 채운 새 커맨드. values 가 먼저다. file 은 기본값이 없어 values 로 줘야 한다.
 * script 의 name 은 빈 글로 채워지고 빈 이름은 엔진이 건너뛰는 오류라, 이름을 values 로 주지 않으면 넣을 때 거절된다
 */
export function newCommand(schema: EventSchema, code: string, values: Record<string, unknown> = {}): JsonObject {
  const spec = commandSpec(schema, code);
  if (!spec) throw new EditRefused(`모르는 커맨드 ${code}`);
  const cmd: JsonObject = { code };
  for (const a of spec.args) {
    if (hasOwn(values, a.name) && values[a.name] !== undefined) cmd[a.name] = values[a.name];
    else if (a.required) {
      const v = defaultArg(schema, a);
      if (v !== undefined) cmd[a.name] = v;
    }
  }
  for (const [k, v] of Object.entries(values)) if (!hasOwn(cmd, k) && v !== undefined) setOwn(cmd, k, v);
  return canonicalCommand(cmd, schema) as JsonObject;
}

function defaultArg(schema: EventSchema, a: ArgSpec): unknown {
  if (a.default !== undefined) return cloneJson(a.default);
  switch (a.type) {
    case "string":
    case "text":
    case "ref":
      return "";
    case "integer":
    case "number":
      return Math.max(0, a.min ?? 0);
    case "boolean":
      return false;
    case "enum":
      return a.values?.[0];
    case "scalar":
      return true;
    case "options":
      return Array.from({ length: Math.max(1, a.min ?? 1) }, (_, i) => `항목 ${i + 1}`);
    case "route":
      return [];
    case "condition": {
      const first = schema.conditions[0];
      return first ? { [first.kind]: "" } : {};
    }
    default:
      return undefined;
  }
}

/** 이 목록에 없는 event_N 꼴의 id */
export function uniqueEventId(list: readonly unknown[], base = "event"): string {
  const ids = new Set(list.map((ev) => field(ev, "id")));
  for (let n = 1; ; n++) {
    const id = `${base}_${n}`;
    if (!ids.has(id)) return id;
  }
}

function uniqueCopyId(id: string, taken: Set<string>): string {
  if (!taken.has(id)) return id;
  const base = id.replace(/_\d+$/, "");
  for (let n = 2; ; n++) {
    const next = `${base}_${n}`;
    if (!taken.has(next)) return next;
  }
}

/** 경로에서 events[n] 을 뗀다 (알림 글에 쓴다) */
function relative(location: string): string {
  return location.replace(/^events\[\d+\]/, "");
}

export class EventEditor {
  constructor(
    readonly section: EventsSection,
    private readonly context: () => EditContext,
  ) {}

  // ---- 공통 ----

  private ctx(): EditContext {
    const c = this.context();
    if (c.locked) throw new EditRefused(c.locked);
    if (!this.section.usable) throw new EditRefused(this.section.shapeError ?? "events 를 고칠 수 없다");
    return c;
  }

  private errors(list: readonly unknown[], ctx: EditContext): EventProblem[] {
    return validateEvents(list, { schema: ctx.schema, map: ctx.map });
  }

  /** after 에 before 에 없던 오류가 있으면 거절한다 */
  private guard(before: readonly unknown[], after: readonly unknown[], ctx: EditContext): void {
    const old = errorKeys(this.errors(before, ctx));
    const added = this.errors(after, ctx).find((p) => p.severity === "error" && !old.has(`${p.location}|${p.message}`));
    if (added) throw new EditRefused(`${added.location}: ${added.message}`);
  }

  private commit(label: string, after: readonly unknown[], focus: readonly number[], key?: string): EventListCommand {
    return new EventListCommand(label, this.section, this.section.list, after, focus, key);
  }

  private eventAt(index: number): JsonObject {
    const ev = this.section.list[index];
    if (ev === undefined) throw new EditRefused(`이벤트가 없다 (${index + 1} 번째)`);
    if (!isPlainObject(ev)) throw new EditRefused(`events[${index + 1}] 는 객체가 아니라 고칠 수 없다`);
    return ev;
  }

  private withEvent(index: number, next: JsonObject): unknown[] {
    const out = [...this.section.list];
    out[index] = next;
    return out;
  }

  private tree<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof TreeError) throw new EditRefused(e.message);
      throw e;
    }
  }

  // ---- 이벤트 ----

  /** 빈 칸에 새 이벤트: 겹치지 않는 event_N, trigger action, 외형 없음, 커맨드 없음 */
  addEvent(cell: Cell, init: Record<string, unknown> = {}): EventListCommand {
    const ctx = this.ctx();
    const list = this.section.list;
    const ev = canonicalEvent({ id: uniqueEventId(list), x: cell.x, y: cell.y, trigger: "action", commands: [], ...init }, ctx.schema);
    const after = [...list, ev];
    this.guard(list, after, ctx);
    return this.commit("이벤트 추가", after, [list.length]);
  }

  /** 복사 (클립보드에 둘 깊은 사본) */
  copyEvents(indices: readonly number[]): unknown[] {
    return [...indices].sort((a, b) => a - b).map((i) => cloneJson(this.eventAt(i)));
  }

  /** 붙여넣기: 첫 이벤트가 cell 에 오고 나머지는 거리를 지킨다. id 는 겹치지 않게, 배회 구역도 함께 옮긴다 */
  pasteEvents(events: readonly unknown[], cell: Cell): EventListCommand {
    const ctx = this.ctx();
    const list = this.section.list;
    const copies = events.filter(isPlainObject).map((e) => cloneJson(e));
    if (copies.length === 0) throw new EditRefused("붙일 이벤트가 없다");
    const first = copies[0];
    if (!isNonNegInt(first.x) || !isNonNegInt(first.y)) throw new EditRefused("붙일 이벤트의 칸이 틀렸다");
    const dx = cell.x - first.x;
    const dy = cell.y - first.y;
    const taken = new Set(list.map((ev) => field(ev, "id")).filter(isJsonText));
    const added = copies.map((ev) => {
      const id = isJsonText(ev.id) && ev.id !== "" ? uniqueCopyId(ev.id, taken) : uniqueEventId([...list, ...[...taken].map((t) => ({ id: t }))]);
      taken.add(id);
      return canonicalEvent(shifted({ ...ev, id }, dx, dy, false), ctx.schema);
    });
    const after = [...list, ...added];
    this.guard(list, after, ctx);
    return this.commit(
      "이벤트 붙여넣기",
      after,
      added.map((_, k) => list.length + k),
    );
  }

  removeEvents(indices: readonly number[]): EventListCommand {
    this.ctx();
    const drop = new Set(indices);
    for (const i of drop) if (this.section.list[i] === undefined) throw new EditRefused(`이벤트가 없다 (${i + 1} 번째)`);
    if (drop.size === 0) throw new EditRefused("지울 이벤트가 없다");
    const after = this.section.list.filter((_, i) => !drop.has(i));
    return this.commit("이벤트 지우기", after, []);
  }

  /** 칸 단위로 옮긴다. 배회 구역도 같은 만큼 옮기고, keepArea 면 구역은 둔다 */
  moveEvents(indices: readonly number[], dx: number, dy: number, opts: EditOptions & { keepArea?: boolean } = {}): EventListCommand {
    const ctx = this.ctx();
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) throw new EditRefused("칸 단위로만 옮긴다");
    const list = this.section.list;
    const out = [...list];
    for (const i of indices) {
      const ev = this.eventAt(i);
      if (!isNonNegInt(ev.x) || !isNonNegInt(ev.y)) throw new EditRefused(`events[${i + 1}] 의 칸이 틀려 옮길 수 없다`);
      out[i] = shifted(ev, dx, dy, opts.keepArea === true);
    }
    this.guard(list, out, ctx);
    const key = opts.mergeKey === undefined ? undefined : `rpg:move:${[...indices].sort((a, b) => a - b).join(",")}:${opts.mergeKey}`;
    return this.commit("이벤트 옮기기", out, indices, key);
  }

  /** 이벤트 칸 하나. id 는 이름 바꾸기(참조 함께), commands 는 커맨드 명령으로 고친다. undefined 는 칸을 지운다 */
  setField(index: number, name: string, value: unknown, opts: EditOptions = {}): EventListCommand {
    if (name === "id") return this.renameEvent(index, value as string, opts);
    const ctx = this.ctx();
    const spec = fieldSpec(ctx.schema, name);
    if (!spec) throw new EditRefused(`스키마에 없는 이벤트 칸 ${name}`);
    if (spec.type === "list") throw new EditRefused("커맨드는 커맨드 명령으로 고친다");
    const ev = this.eventAt(index);
    const next: JsonObject = { ...ev };
    if (value === undefined) delete next[name];
    else next[name] = canonicalField(spec, cloneJson(value));
    const after = this.withEvent(index, orderEvent(next, ctx.schema));
    this.guard(this.section.list, after, ctx);
    const key = opts.mergeKey === undefined ? undefined : `rpg:field:${index}:${name}:${opts.mergeKey}`;
    return this.commit(`이벤트 칸 바꾸기: ${spec.label}`, after, [index], key);
  }

  /** id 를 바꾸고 이 맵의 moveRoute.target, turn.target 도 함께 바꾼다 (명령 하나) */
  renameEvent(index: number, id: string, opts: EditOptions = {}): EventListCommand {
    const ctx = this.ctx();
    const ev = this.eventAt(index);
    if (typeof id !== "string") throw new EditRefused("id 는 글이다");
    const old = field(ev, "id");
    const list = this.section.list;
    let after = this.withEvent(index, orderEvent({ ...ev, id }, ctx.schema));
    // 옛 id 를 쓰는 다른 이벤트가 남아 있으면 참조는 그쪽을 가리키므로 두다
    const stillUsed = list.some((e, i) => i !== index && field(e, "id") === old);
    if (isJsonText(old) && old !== "" && old !== id && !stillUsed && !ctx.schema.reserved.includes(old)) {
      after = after.map((e) => renameRefs(e, old, id, ctx.schema));
    }
    this.guard(list, after, ctx);
    const key = opts.mergeKey === undefined ? undefined : `rpg:rename:${index}:${opts.mergeKey}`;
    return this.commit("이벤트 이름 바꾸기", after, [index], key);
  }

  /** 배회를 켜거나(객체) 끈다(undefined) */
  setWander(index: number, wander: JsonObject | undefined, opts: EditOptions = {}): EventListCommand {
    return this.setField(index, "wander", wander, opts);
  }

  /** 배회 구역 (맵 위 사각형의 가장자리 끌기) */
  setWanderArea(index: number, area: { x: number; y: number; w: number; h: number } | undefined, opts: EditOptions = {}): EventListCommand {
    const ev = this.eventAt(index);
    const wander = field(ev, "wander");
    if (!isObjectPlace(wander)) throw new EditRefused("배회가 꺼져 있다");
    const next: JsonObject = { ...(isPlainObject(wander) ? wander : {}) };
    if (area === undefined) delete next.area;
    else next.area = area;
    return this.setField(index, "wander", next, opts);
  }

  // ---- 커맨드 ----

  private withCommands(index: number, fn: (commands: unknown) => unknown[]): unknown[] {
    const ctx = this.ctx();
    const ev = this.eventAt(index);
    const commands = field(ev, "commands");
    if (commands !== undefined && !isArrayPlace(commands)) throw new EditRefused(`events[${index + 1}].commands 가 배열이 아니라 고칠 수 없다`);
    const next = this.tree(() => fn(commands ?? []));
    const nextEv = commands !== undefined ? { ...ev, commands: next } : orderEvent({ ...ev, commands: next }, ctx.schema);
    return this.withEvent(index, nextEv);
  }

  /** 새 커맨드 하나하나가 엔진 검사와 배열 끝 null 검사를 통과해야 한다 */
  private checkNewCommands(commands: readonly unknown[], schema: EventSchema): void {
    const probe = [{ id: "probe", x: 0, y: 0, commands }];
    const bad = validateEvents(probe, { schema }).find((p) => p.severity === "error");
    if (bad) throw new EditRefused(`넣을 커맨드가 틀렸다 (${relative(bad.location)}): ${bad.message}`);
  }

  /** list 목록의 at 자리에 넣는다. 없는 하위 목록은 만든다 */
  insertCommands(index: number, list: ListPath, at: number, commands: readonly unknown[]): EventListCommand {
    const ctx = this.ctx();
    if (commands.length === 0) throw new EditRefused("넣을 커맨드가 없다");
    const added = commands.map((c) => canonicalCommand(cloneJson(c), ctx.schema));
    this.checkNewCommands(added, ctx.schema);
    const after = this.withCommands(index, (cmds) => treeInsert(cmds, list, at, added, ctx.schema));
    return this.commit("커맨드 넣기", after, [index]);
  }

  removeCommands(index: number, list: ListPath, at: number, count = 1): EventListCommand {
    const ctx = this.ctx();
    const after = this.withCommands(index, (cmds) => treeRemove(cmds, list, at, count, ctx.schema));
    return this.commit("커맨드 빼기", after, [index]);
  }

  /** from 에서 count 개를 to 목록의 index 자리(떼기 전 기준)로 */
  moveCommands(index: number, from: CommandPath, count: number, to: { list: ListPath; index: number }): EventListCommand {
    const ctx = this.ctx();
    const after = this.withCommands(index, (cmds) => treeMove(cmds, from, count, to, ctx.schema));
    return this.commit("커맨드 옮기기", after, [index]);
  }

  /** 커맨드의 목록을 읽는다 (없으면 빈 배열) */
  commandsOf(index: number, list: ListPath = []): readonly unknown[] {
    const ev = this.eventAt(index);
    const items = getList(field(ev, "commands"), list, this.context().schema);
    if (!items) throw new EditRefused("목록이 배열이 아니다");
    return items;
  }

  private commandAt(index: number, path: CommandPath, schema: EventSchema): JsonObject {
    const cmd = getCommand(field(this.eventAt(index), "commands"), path, schema);
    if (!isPlainObject(cmd)) throw new EditRefused("커맨드가 객체가 아니라 고칠 수 없다");
    return cmd;
  }

  private replaceAt(index: number, path: CommandPath, next: JsonObject, schema: EventSchema): unknown[] {
    return this.withCommands(index, (cmds) => replaceCommand(cmds, path, next, schema));
  }

  /** 인자 하나. undefined 는 인자를 지운다 (필수 인자는 거절). 항목(options)은 항목 명령으로 고친다 */
  setArg(index: number, path: CommandPath, name: string, value: unknown, opts: EditOptions = {}): EventListCommand {
    const ctx = this.ctx();
    const cmd = this.commandAt(index, path, ctx.schema);
    const spec = commandSpec(ctx.schema, cmd.code);
    if (!spec) throw new EditRefused(`모르는 커맨드 ${jsonValueText(cmd.code)} 는 고칠 수 없다`);
    const arg = spec.args.find((a) => a.name === name);
    if (!arg) throw new EditRefused(`${spec.label} 에는 ${name} 인자가 없다`);
    if (arg.type === "options") throw new EditRefused("항목은 항목 명령으로 고친다 (가지와 취소 번호를 함께 맞춘다)");
    const next: JsonObject = { ...cmd };
    if (value === undefined) delete next[name];
    else next[name] = (canonicalCommand({ code: cmd.code, [name]: cloneJson(value) }, ctx.schema) as JsonObject)[name];
    const ordered = orderCommand(next, ctx.schema);
    this.checkArgValue(ordered, name, ctx.schema);
    const after = this.replaceAt(index, path, ordered, ctx.schema);
    const key = opts.mergeKey === undefined ? undefined : `rpg:arg:${index}:${JSON.stringify(path)}:${name}:${opts.mergeKey}`;
    return this.commit(`인자 바꾸기: ${arg.label}`, after, [index], key);
  }

  /**
   * 인자 여럿을 한 명령으로 (맵 이동의 x 와 y 처럼 함께 바뀌는 값). 되돌리기 한 단계이고 값이 모두 그대로면 unchanged 다.
   * 규칙은 setArg 와 같다: undefined 는 지우고(필수 인자는 거절), 항목(options)은 항목 명령으로, 인자 하나라도 틀리면 전부 거절한다
   */
  setArgs(index: number, path: CommandPath, values: Readonly<Record<string, unknown>>, opts: EditOptions = {}): EventListCommand {
    const ctx = this.ctx();
    const names = Object.keys(values);
    if (names.length === 0) throw new EditRefused("바꿀 인자 없음");
    const cmd = this.commandAt(index, path, ctx.schema);
    const spec = commandSpec(ctx.schema, cmd.code);
    if (!spec) throw new EditRefused(`모르는 커맨드 ${String(cmd.code)} 는 고칠 수 없다`);
    const next: JsonObject = { ...cmd };
    for (const name of names) {
      const arg = spec.args.find((a) => a.name === name);
      if (!arg) throw new EditRefused(`${spec.label} 에는 ${name} 인자가 없다`);
      if (arg.type === "options") throw new EditRefused("항목은 항목 명령으로 고친다 (가지와 취소 번호를 함께 맞춘다)");
      const value = values[name];
      if (value === undefined) delete next[name];
      else next[name] = (canonicalCommand({ code: cmd.code, [name]: cloneJson(value) }, ctx.schema) as JsonObject)[name];
    }
    const ordered = orderCommand(next, ctx.schema);
    for (const name of names) this.checkArgValue(ordered, name, ctx.schema);
    const after = this.replaceAt(index, path, ordered, ctx.schema);
    const key = opts.mergeKey === undefined ? undefined : `rpg:args:${index}:${JSON.stringify(path)}:${names.join(",")}:${opts.mergeKey}`;
    return this.commit(`인자 바꾸기: ${names.join(", ")}`, after, [index], key);
  }

  /** 커맨드 하나를 따로 검사해 name 인자 자리의 오류만 본다 (하위 목록의 옛 오류는 막지 않는다) */
  private checkArgValue(cmd: JsonObject, name: string, schema: EventSchema): void {
    const probe = [{ id: "probe", x: 0, y: 0, commands: [cmd] }];
    const prefix = `events[1].commands[1].${name}`;
    const bad = validateEvents(probe, { schema }).find(
      (p) => p.severity === "error" && (p.location === prefix || p.location.startsWith(`${prefix}.`) || p.location.startsWith(`${prefix}[`)),
    );
    if (bad) throw new EditRefused(`${name}: ${bad.message}`);
  }

  // ---- 선택지 항목: 가지와 cancel 을 함께 맞춘다 ----

  private choiceAt(index: number, path: CommandPath, schema: EventSchema): { cmd: JsonObject; options: unknown[]; branchesName: string | null } {
    const cmd = this.commandAt(index, path, schema);
    const spec = commandSpec(schema, cmd.code);
    const list = spec?.lists.find((l) => l.perOption);
    if (!spec || !list) throw new EditRefused("항목이 있는 커맨드가 아니다");
    const options = asList(field(cmd, list.perOption!));
    if (!options) throw new EditRefused("항목 목록이 배열이 아니라 고칠 수 없다");
    const branches = field(cmd, list.name);
    if (branches !== undefined && !isArrayPlace(branches)) throw new EditRefused("가지 목록이 배열이 아니라 고칠 수 없다");
    return { cmd, options: [...options], branchesName: list.name };
  }

  private optionsCommand(index: number, path: CommandPath, label: string, fn: (s: { options: unknown[]; branches: unknown[] | null; cancel: number | undefined }) => void, key?: string): EventListCommand {
    const ctx = this.ctx();
    const { cmd, options, branchesName } = this.choiceAt(index, path, ctx.schema);
    const spec = commandSpec(ctx.schema, cmd.code)!;
    const optionsArg = spec.lists.find((l) => l.perOption)!.perOption!;
    const rawBranches = branchesName ? field(cmd, branchesName) : undefined;
    const branches = rawBranches === undefined ? null : [...(asList(rawBranches) ?? [])];
    const cancelRaw = field(cmd, "cancel");
    const state = { options, branches, cancel: isInteger(cancelRaw) ? cancelRaw : undefined };
    fn(state);
    const next: JsonObject = { ...cmd, [optionsArg]: state.options };
    if (branchesName && state.branches) next[branchesName] = state.branches;
    if (isInteger(cancelRaw) || state.cancel !== undefined) {
      if (state.cancel === undefined) delete next.cancel;
      else next.cancel = state.cancel;
    }
    const ordered = orderCommand(next, ctx.schema);
    this.checkArgValue(ordered, optionsArg, ctx.schema);
    const after = this.replaceAt(index, path, ordered, ctx.schema);
    return this.commit(label, after, [index], key);
  }

  addOption(index: number, path: CommandPath, at: number, text: string): EventListCommand {
    if (typeof text !== "string") throw new EditRefused("항목은 글이다");
    return this.optionsCommand(index, path, "항목 더하기", (s) => {
      if (!Number.isInteger(at) || at < 0 || at > s.options.length) throw new EditRefused("항목 자리가 틀렸다");
      s.options.splice(at, 0, text);
      if (s.branches) {
        while (s.branches.length < at) s.branches.push([]);
        s.branches.splice(at, 0, []);
      }
      if (s.cancel !== undefined && s.cancel >= at + 1) s.cancel++;
    });
  }

  /** 항목을 빼면 그 가지도 빠진다. 취소가 그 항목이었으면 취소 번호를 지운다 */
  removeOption(index: number, path: CommandPath, k: number): EventListCommand {
    return this.optionsCommand(index, path, "항목 빼기", (s) => {
      if (!Number.isInteger(k) || k < 0 || k >= s.options.length) throw new EditRefused("항목 자리가 틀렸다");
      if (s.options.length <= 1) throw new EditRefused("항목이 하나 이상 있어야 한다");
      s.options.splice(k, 1);
      if (s.branches && s.branches.length > k) s.branches.splice(k, 1);
      if (s.cancel !== undefined) {
        if (s.cancel === k + 1) s.cancel = undefined;
        else if (s.cancel > k + 1) s.cancel--;
      }
    });
  }

  /** from 번째 항목을 to 번째로 (둘 다 옮긴 뒤의 자리). 가지와 취소 번호가 따라간다 */
  moveOption(index: number, path: CommandPath, from: number, to: number): EventListCommand {
    return this.optionsCommand(index, path, "항목 옮기기", (s) => {
      const n = s.options.length;
      if (![from, to].every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new EditRefused("항목 자리가 틀렸다");
      const [opt] = s.options.splice(from, 1);
      s.options.splice(to, 0, opt);
      if (s.branches) {
        while (s.branches.length < n) s.branches.push([]);
        const [branch] = s.branches.splice(from, 1);
        s.branches.splice(to, 0, branch);
      }
      if (s.cancel !== undefined) {
        const c = s.cancel - 1;
        if (c === from) s.cancel = to + 1;
        else if (from < c && c <= to) s.cancel = c;
        else if (to <= c && c < from) s.cancel = c + 2;
      }
    });
  }

  setOption(index: number, path: CommandPath, k: number, text: string, opts: EditOptions = {}): EventListCommand {
    if (typeof text !== "string") throw new EditRefused("항목은 글이다");
    const key = opts.mergeKey === undefined ? undefined : `rpg:option:${index}:${JSON.stringify(path)}:${k}:${opts.mergeKey}`;
    return this.optionsCommand(
      index,
      path,
      "항목 고치기",
      (s) => {
        if (!Number.isInteger(k) || k < 0 || k >= s.options.length) throw new EditRefused("항목 자리가 틀렸다");
        s.options[k] = text;
      },
      key,
    );
  }
}

function canonicalField(spec: ArgSpec, value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  if (spec.type === "charset") return orderRef(value);
  if (spec.type === "wander") {
    const w = orderWander(value);
    if (isPlainObject(w.area)) w.area = orderArea(w.area);
    return w;
  }
  return value;
}

/** 칸과 배회 구역을 옮긴 사본 */
function shifted(ev: JsonObject, dx: number, dy: number, keepArea: boolean): JsonObject {
  const next: JsonObject = { ...ev };
  if (isInteger(ev.x)) next.x = ev.x + dx;
  if (isInteger(ev.y)) next.y = ev.y + dy;
  const wander = field(ev, "wander");
  const area = field(wander, "area");
  if (!keepArea && isPlainObject(wander) && isPlainObject(area) && isInteger(area.x) && isInteger(area.y)) {
    next.wander = { ...wander, area: { ...area, x: area.x + dx, y: area.y + dy } };
  }
  return next;
}

/** 이 이벤트의 커맨드에서 character 참조가 old 인 인자를 id 로 바꾼 사본 (바뀐 것이 없으면 그대로) */
function renameRefs(ev: unknown, old: string, id: string, schema: EventSchema): unknown {
  if (!isPlainObject(ev)) return ev;
  let commands = field(ev, "commands");
  if (commands === undefined || !isArrayPlace(commands)) return ev;
  const targets: Array<{ path: CommandPath; name: string }> = [];
  walkCommands(commands, schema, (cmd, path) => {
    const spec = commandSpec(schema, cmd.code);
    for (const a of spec?.args ?? []) if (a.type === "ref" && a.ref === "character" && cmd[a.name] === old) targets.push({ path, name: a.name });
  });
  if (targets.length === 0) return ev;
  for (const t of targets) {
    const cmd = getCommand(commands, t.path, schema) as JsonObject;
    commands = replaceCommand(commands, t.path, { ...cmd, [t.name]: id }, schema);
  }
  return { ...ev, commands };
}
