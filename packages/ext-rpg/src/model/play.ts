// 여기서 실행과 자동 재생 (docs/plans/e5-rpg.md 5.2, 엔진 M2 2.4 와 5.2).
//
//   앞 칸          외형과 dir 이 있으면 그 이벤트가 바라보는 칸, 그다음 아래, 왼쪽, 오른쪽, 위 순서로 설 수 있는 첫 칸.
//                  플레이어는 이벤트 쪽을 본다. 네 칸이 다 막혔으면 가장 가까운 칸으로 넘어간다
//   설 수 있는 칸  맵 안이고, 통행 0 이고, 막는 이벤트(엔진 Event:isSolid)가 없는 칸
//   가장 가까운 칸 넓이 우선 (맨해튼 거리, 같은 거리면 아래, 왼쪽, 오른쪽, 위 순서)
//   실행 변수      rpg-game.json의 play.env (자동 재생은 play.probe를 더한다). 채울 값이 없는 자리표시자가 든 변수는 넣지 않는다.
//                  자동 재생은 에디터가 게임의 줄(rpg:map:, rpg:event:)을 지켜보므로 play 설정과 상관없이 INITIAL2D_RPG_TRACE=1을 넣는다
// 교차 검사(yarn test:engine-events)가 이 함수들을 그대로 불러 엔진 프로세스를 띄운다.

import { field, isJsonText, isNonNegInt, isObjectPlace, isPlainObject } from "./json";
import type { PlaySection } from "./game";
import type { MapGeometry } from "./validate";

export type Dir = "down" | "left" | "right" | "up";

/** 앞 칸과 가장 가까운 칸을 고르는 순서 */
export const SEARCH_DIRS: readonly Dir[] = ["down", "left", "right", "up"];

export const DIR_VECTORS: Readonly<Record<Dir, readonly [number, number]>> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

export interface Cell {
  x: number;
  y: number;
}

export interface PlayAt extends Cell {
  dir: Dir;
}

function isDir(v: unknown): v is Dir {
  return v === "down" || v === "left" || v === "right" || v === "up";
}

function inMap(map: MapGeometry, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < map.width && c.y < map.height;
}

/** 통행을 막는 이벤트인가: solid 가 있으면 그 값, 없으면 외형이 있고 through 가 아니면 */
export function isBlockingEvent(ev: unknown): boolean {
  if (!isObjectPlace(ev)) return false;
  const solid = field(ev, "solid");
  if (typeof solid === "boolean") return solid;
  return field(ev, "charset") !== undefined && field(ev, "through") !== true;
}

function eventCell(ev: unknown): Cell | null {
  const x = field(ev, "x");
  const y = field(ev, "y");
  return isNonNegInt(x) && isNonNegInt(y) ? { x, y } : null;
}

/** 설 수 있는 칸인가 */
export function isStandable(map: MapGeometry, events: readonly unknown[], c: Cell): boolean {
  if (!inMap(map, c)) return false;
  if (map.collision && (map.collision[c.y * map.width + c.x] ?? 0) !== 0) return false;
  return !events.some((ev) => {
    const at = eventCell(ev);
    return at !== null && at.x === c.x && at.y === c.y && isBlockingEvent(ev);
  });
}

/** start 에서 넓이 우선으로 맵 안의 칸을 훑는다 (start 먼저, 같은 거리면 아래, 왼쪽, 오른쪽, 위 순서로 퍼진다) */
export function* cellsByDistance(map: MapGeometry, start: Cell): Generator<Cell> {
  const origin = { x: Math.min(Math.max(0, Math.round(start.x)), map.width - 1), y: Math.min(Math.max(0, Math.round(start.y)), map.height - 1) };
  const seen = new Set<number>([origin.y * map.width + origin.x]);
  const queue: Cell[] = [origin];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    yield c;
    for (const d of SEARCH_DIRS) {
      const [vx, vy] = DIR_VECTORS[d];
      const n = { x: c.x + vx, y: c.y + vy };
      const key = n.y * map.width + n.x;
      if (inMap(map, n) && !seen.has(key)) {
        seen.add(key);
        queue.push(n);
      }
    }
  }
}

/** 가장 가까운 설 수 있는 칸 (start 자신 포함). 없으면 null */
export function nearestStandable(map: MapGeometry, events: readonly unknown[], start: Cell): Cell | null {
  for (const c of cellsByDistance(map, start)) if (isStandable(map, events, c)) return c;
  return null;
}

/** from 에서 to 를 보는 방향 (엔진 Event:turnToward 와 같다: 더 먼 축, 같으면 세로) */
export function facing(from: Cell, to: Cell): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  return "down";
}

export interface FrontCell extends PlayAt {
  /** 이벤트 바로 옆인가 (아니면 네 칸이 다 막혀 가장 가까운 칸으로 옮겼다) */
  adjacent: boolean;
}

/** index 번째 이벤트의 앞 칸. 이벤트의 칸이 틀렸거나 설 칸이 없으면 null */
export function frontCell(map: MapGeometry, events: readonly unknown[], index: number): FrontCell | null {
  const ev = events[index];
  const at = eventCell(ev);
  if (!at) return null;
  const order: Cell[] = [];
  const dir = field(ev, "dir");
  if (field(ev, "charset") !== undefined && isDir(dir)) order.push({ x: at.x + DIR_VECTORS[dir][0], y: at.y + DIR_VECTORS[dir][1] });
  for (const d of SEARCH_DIRS) {
    const c = { x: at.x + DIR_VECTORS[d][0], y: at.y + DIR_VECTORS[d][1] };
    if (!order.some((o) => o.x === c.x && o.y === c.y)) order.push(c);
  }
  for (const c of order) if (isStandable(map, events, c)) return { ...c, dir: facing(c, at), adjacent: true };
  const near = nearestStandable(map, events, at);
  return near ? { ...near, dir: facing(near, at), adjacent: false } : null;
}

// ---- 시작 상태 (INITIAL2D_RPG_STATE, 엔진 playenv.lua 의 parseState 와 같은 규칙) ----

export const ITEM_PREFIX = "item:";

export interface StartStateError {
  entry: string;
  message: string;
}

export interface StartState {
  /** 깃발과 변수 */
  state: Record<string, boolean | number | string>;
  /** 아이템 id → 개수 */
  items: Record<string, number>;
  errors: StartStateError[];
}

function scalar(text: string): boolean | number | string {
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^[+-]?\d+\.?\d*$/.test(text) || /^[+-]?\.\d+$/.test(text)) return Number(text);
  return text;
}

/**
 * 시작 상태 글을 엔진처럼 읽는다: 쉼표로 가른 항목마다 "이름"(참), "이름=값", "item:<id>=<n>", "item:<id>"(하나).
 * 뒤의 항목이 앞의 것을 덮는다. items 가 있으면 아이템 표에 없는 id 를 틀린 항목으로 본다
 */
export function parseStartState(text: string, opts: { items?: ReadonlySet<string> | null; reserved?: readonly string[] } = {}): StartState {
  const out: StartState = { state: {}, items: {}, errors: [] };
  const reserved = opts.reserved ?? ["items"];
  const bad = (entry: string, message: string) => out.errors.push({ entry, message });
  for (const raw of text.split(",")) {
    const entry = raw.trim();
    if (entry === "") continue;
    const eq = entry.indexOf("=");
    const key = (eq < 0 ? entry : entry.slice(0, eq)).trim();
    const value = eq < 0 ? undefined : entry.slice(eq + 1).trim();
    if (key.startsWith(ITEM_PREFIX)) {
      const id = key.slice(ITEM_PREFIX.length);
      const count = value === undefined ? 1 : /^\d+$/.test(value) ? Number(value) : null;
      if (id === "") bad(entry, "아이템 id 가 비었다");
      else if (count === null) bad(entry, "개수가 0 이상의 정수가 아니다");
      else if (opts.items && !opts.items.has(id)) bad(entry, `아이템 표에 없는 id ${id}`);
      else out.items[id] = (out.items[id] ?? 0) + count;
    } else if (key === "") bad(entry, "이름이 비었다");
    else if (key.includes(":")) bad(entry, "모르는 접두사 (아이템은 item:<id>)");
    else if (reserved.includes(key)) bad(entry, `${key} 는 소지품 자리라 쓸 수 없다`);
    else if (value === undefined) out.state[key] = true;
    else if (value === "") bad(entry, "값이 비었다");
    else out.state[key] = scalar(value);
  }
  return out;
}

/** 실행 변수에 넣을 시작 상태. 비었으면 null (변수를 넘기지 않는다) */
export function startStateValue(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return t === "" ? null : t;
}

// ---- 실행 변수 ----

export interface PlayTarget {
  /** rpg-game.json 의 맵 이름 */
  map: string;
  /** 자동 재생하는 이벤트의 id ({event}, 엔진의 INITIAL2D_RPG_HOLD가 그 이벤트의 배회를 멈춘다). 없으면 그 변수를 넣지 않는다 */
  event?: string | null;
  /** 없으면 정의 파일의 시작에 선다 */
  at?: PlayAt | null;
  /** 시작 상태 글 */
  state?: string | null;
}

/** 템플릿의 {이름} 을 채운다. 채울 값이 없는 자리표시자가 든 변수는 뺀다 */
export function fillPlayEnv(templates: Readonly<Record<string, string>>, values: Readonly<Record<string, string | null | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, template] of Object.entries(templates)) {
    const names = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (names.some((n) => values[n] === undefined || values[n] === null)) continue;
    out[key] = template.replace(/\{([^}]+)\}/g, (_, n: string) => values[n] as string);
  }
  return out;
}

function targetValues(target: PlayTarget, route?: string): Record<string, string | null | undefined> {
  const values: Record<string, string | null | undefined> = { "rpg.map": target.map, state: startStateValue(target.state), route, event: target.event };
  if (target.at) {
    values.cx = String(target.at.x);
    values.cy = String(target.at.y);
    values.dir = target.at.dir;
  }
  return values;
}

/** 여기서 실행과 이 이벤트 앞에서 실행의 변수 (러너의 기본 변수 뒤에 덧씌운다) */
export function planEnv(play: PlaySection | null | undefined, target: PlayTarget): Record<string, string> {
  if (!play) return {};
  return fillPlayEnv(play.env, targetValues(target));
}

/** 엔진이 이 id 의 이벤트를 배회시키지 않고 맵 파일의 위치에 세우는 변수 (play.probe 의 "{event}") */
export const HOLD_ENV = "INITIAL2D_RPG_HOLD";

/** 실행 변수가 이 이벤트를 세우는가 (HOLD_ENV 가 그 id 다) */
export function holdsEvent(env: Readonly<Record<string, string>>, eventId: string | null): boolean {
  return eventId !== null && env[HOLD_ENV] === eventId;
}

/** 자동 재생이 늘 넣는 변수: 에디터가 지켜보는 줄(rpgPlay.ts의 probeWatch)을 엔진이 찍게 한다 */
export const PROBE_TRACE_ENV: Readonly<Record<string, string>> = { INITIAL2D_RPG_TRACE: "1" };

/**
 * 자동 재생의 변수: play.env에 play.probe를 더하고 PROBE_TRACE_ENV를 덮는다 (프로젝트가 trace를 빼도 지켜보기가 선다).
 * 빈 경로도 값이다 (걸음 없이 auto만 기다린다). {event}는 이벤트 id다
 */
export function probeEnv(play: PlaySection | null | undefined, target: PlayTarget & { route: string }): Record<string, string> {
  if (!play) return {};
  return { ...fillPlayEnv({ ...play.env, ...play.probe }, targetValues(target, target.route)), ...PROBE_TRACE_ENV };
}

// ---- 실행 명령이 고르는 자리 ----

export interface PlayPlanChoice {
  at: PlayAt | null;
  /** 자동 재생의 경로 (INITIAL2D_RPG_ROUTE). 손으로 하는 실행은 null */
  route: string | null;
  /** 상태 띠와 로그에 보일 설명 */
  note: string;
}

export type PlayPlanResult = { ok: true; plan: PlayPlanChoice } | { ok: false; reason: string };

function eventName(ev: unknown, index: number): string {
  const id = field(ev, "id");
  return isJsonText(id) && id !== "" ? id : `events[${index + 1}]`;
}

/**
 * 이 이벤트 앞에서 실행(mode "play")과 이 이벤트 자동 재생(mode "probe").
 * 자동 재생: action 은 talk, touch 는 이벤트 쪽으로 한 걸음, auto 는 위치 없이 빈 경로, parallel 은 거절한다
 */
export function eventPlayPlan(map: MapGeometry, events: readonly unknown[], index: number, mode: "play" | "probe"): PlayPlanResult {
  const ev = events[index];
  if (!isPlainObject(ev)) return { ok: false, reason: `events[${index + 1}] 는 객체가 아니다` };
  const name = eventName(ev, index);
  const trigger = field(ev, "trigger") ?? "action";
  if (mode === "probe") {
    if (trigger === "parallel") return { ok: false, reason: "parallel 은 끝나지 않는다 (자동 재생을 할 수 없다)" };
    if (trigger === "auto") return { ok: true, plan: { at: null, route: "", note: `auto 이벤트 ${name}: 맵에 들어올 때 돈다` } };
  }
  const front = frontCell(map, events, index);
  if (!front) return { ok: false, reason: `${name} 의 칸이 틀렸거나 설 수 있는 칸이 없다` };
  const at: PlayAt = { x: front.x, y: front.y, dir: front.dir };
  const where = front.adjacent ? `이벤트 ${name} 앞` : `이벤트 ${name} 근처 (옆 칸이 다 막혀 옮겼다)`;
  if (mode === "play") return { ok: true, plan: { at, route: null, note: where } };
  if (!front.adjacent) return { ok: false, reason: `${name} 옆에 설 칸이 없어 자동 재생이 닿지 못한다` };
  if (trigger === "touch") {
    const cell = eventCell(ev)!;
    if (isBlockingEvent(ev)) return { ok: false, reason: `${name} 은 통행을 막아 밟을 수 없다 (touch 가 돌지 않는다)` };
    if (map.collision && (map.collision[cell.y * map.width + cell.x] ?? 0) !== 0) return { ok: false, reason: `${name} 이 막힌 칸에 있어 밟을 수 없다` };
    return { ok: true, plan: { at, route: front.dir, note: `${where}에서 한 걸음` } };
  }
  return { ok: true, plan: { at, route: "talk", note: `${where}에서 말 걸기` } };
}

/** 커서 칸이나 뷰 가운데에서 실행: 가장 가까운 설 수 있는 칸으로 옮기고 아래를 본다 */
export function herePlayPlan(map: MapGeometry, events: readonly unknown[], start: Cell): PlayPlanResult {
  const sx = Math.round(start.x);
  const sy = Math.round(start.y);
  const c = nearestStandable(map, events, { x: sx, y: sy });
  if (!c) return { ok: false, reason: "설 수 있는 칸이 없다" };
  const moved = c.x !== sx || c.y !== sy;
  return { ok: true, plan: { at: { ...c, dir: "down" }, route: null, note: moved ? `${sx},${sy} → ${c.x},${c.y} (막힌 칸이라 옮겼다)` : `${c.x},${c.y}` } };
}

// ---- 맵마다 기억하는 시작 상태 (.initial-editor/rpg-play.json) ----

export const PLAY_MEMORY_PATH = ".initial-editor/rpg-play.json";

/** 맵 경로 → 시작 상태 글. 읽지 못하면 빈 표 */
export function readPlayMemory(text: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!text) return out;
  try {
    const raw: unknown = JSON.parse(text);
    const states = field(raw, "startState");
    if (isPlainObject(states)) for (const [k, v] of Object.entries(states)) if (typeof v === "string") out.set(k, v);
  } catch {
    // 에디터만 쓰는 파일이라 깨졌으면 비운다
  }
  return out;
}

export function writePlayMemory(memory: ReadonlyMap<string, string>): string {
  const startState: Record<string, string> = {};
  for (const [k, v] of [...memory].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) if (v.trim() !== "") startState[k] = v;
  return JSON.stringify({ version: 1, startState }, null, 2) + "\n";
}
