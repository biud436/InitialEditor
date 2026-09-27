// RPG 실행 (docs/plans/e5-rpg.md 5.2). 타일맵의 실행 자리에 붙는 제공자와 이벤트 실행 명령의 계획이다. DOM 을 모른다.
//
//   rpgPlayProvider  여기서 실행 (Ctrl+F5). priority 10 이라 기본 제공자(map-objects.json)보다 먼저 묻는다.
//                    rpg-game.json 에 play 가 있고 이 맵이 등록되어 있으면(mapEntryFor, alt 포함) 받는다.
//                    자리: 고른 이벤트 하나가 있으면 그 앞, 없으면 커서 칸, 없으면 뷰 가운데 (가장 가까운 설 수 있는 칸, 아래를 본다).
//                    셋 다 없으면 위치 변수를 넣지 않아 정의 파일의 시작에 선다
//   eventPlay        이 이벤트 앞에서 실행(play)과 이 이벤트 자동 재생(probe, play.probe 를 더한다). 자리와 경로는 play.ts 의 eventPlayPlan
//   시작 상태         맵마다 기억한 글을 {state} 로 넘긴다. 비었으면 INITIAL2D_RPG_STATE 를 넣지 않는다
// 레이어가 붙지 않은 맵(스키마를 읽는 중이거나 없다)도 맵 파일의 events 원본으로 자리를 고른다.

import type { PlayContext, PlayPlan, PlayProviderSpec, PlayRequest } from "@initial-editor/ext-tilemap";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { EVENTS_SECTION } from "./events";
import { GAME_CONFIG_MISSING, itemIds, mapEntryFor, type MapEntry, type PlaySection } from "./game";
import { asList, field } from "./json";
import { eventsStateOf, type RpgSources } from "./layer";
import { eventPlayPlan, herePlayPlan, parseStartState, planEnv, probeEnv, type Cell, type PlayPlanChoice } from "./play";
import type { MapGeometry } from "./validate";

export const RPG_PLAY_PROVIDER_ID = "rpg.play";
/** 기본 제공자(0)보다 먼저 */
export const RPG_PLAY_PRIORITY = 10;

export type EventPlayMode = "play" | "probe";

export const EVENT_PLAY_LABELS: Readonly<Record<EventPlayMode, string>> = {
  play: "이 이벤트 앞에서 실행",
  probe: "이 이벤트 자동 재생",
};

/** 실행이 읽는 프로젝트의 것: 레이어의 소스와 맵마다 기억한 시작 상태 */
export interface RpgPlaySources extends RpgSources {
  startState(mapPath: string): string;
}

type Target = { ok: true; play: PlaySection; entry: MapEntry } | { ok: false; reason: string | undefined };

/** 이 맵을 RPG 로 띄울 수 있는가. 못 띄우면 이유 (RPG 프로젝트가 아니면 undefined) */
function targetOf(sources: RpgPlaySources, doc: MapDocument): Target {
  const game = sources.game;
  if (!game) {
    const problem = sources.gameProblem;
    if (problem && problem !== GAME_CONFIG_MISSING) return { ok: false, reason: `rpg-game.json 을 읽지 못해 RPG 로 실행하지 않는다 (${problem})` };
    return { ok: false, reason: sources.schemaPresent ? "rpg-game.json 이 없어 RPG 로 실행하지 않는다" : undefined };
  }
  if (!game.play) return { ok: false, reason: "rpg-game.json 에 play 가 없어 RPG 로 실행하지 않는다" };
  const match = mapEntryFor(game, doc.path ?? "");
  if (!match) return { ok: false, reason: "이 맵은 rpg-game.json 에 등록되지 않아 RPG 로 실행하지 않는다" };
  return { ok: true, play: game.play, entry: match.entry };
}

/** 맵의 크기와 통행 (레이어 상태가 없어도) */
export function mapGeometryOf(doc: MapDocument): MapGeometry {
  const m = doc.model;
  return { width: m.width, height: m.height, collision: m.collision };
}

/** 이 맵의 이벤트: 붙은 레이어의 편집 중인 목록, 없으면 맵 파일의 원본 */
export function mapEventsOf(doc: MapDocument): readonly unknown[] {
  const state = eventsStateOf(doc);
  if (state) return state.section.list;
  return asList(doc.model.rawSection(EVENTS_SECTION)) ?? [];
}

/** 월드 픽셀을 칸으로. 맵 밖이면 null */
function cellAt(doc: MapDocument, p: { x: number; y: number }): Cell | null {
  const m = doc.model;
  const x = Math.floor(p.x / m.tileWidth);
  const y = Math.floor(p.y / m.tileHeight);
  return x >= 0 && y >= 0 && x < m.width && y < m.height ? { x, y } : null;
}

/** 시작 상태 글과 설명에 붙일 말 (틀린 항목은 엔진이 건너뛴다) */
function startStateOf(sources: RpgPlaySources, doc: MapDocument): { text: string; note: string | null } {
  const text = sources.startState(doc.path ?? "");
  if (text.trim() === "") return { text, note: null };
  const parsed = parseStartState(text, { items: sources.items ? itemIds(sources.items) : null, reserved: sources.schema?.stateReserved });
  const bad = parsed.errors.length;
  return { text, note: bad > 0 ? `시작 상태 ${text}, 틀린 항목 ${bad}개는 엔진이 건너뛴다` : `시작 상태 ${text}` };
}

function toPlan(env: Record<string, string>, choice: Pick<PlayPlanChoice, "at" | "note">, stateNote: string | null): PlayPlan {
  return { env, at: choice.at ? { x: choice.at.x, y: choice.at.y } : null, note: [choice.note, stateNote].filter(Boolean).join(", ") };
}

/** 여기서 실행의 자리: 고른 이벤트의 앞, 커서 칸, 뷰 가운데. 셋 다 없으면 null (정의 파일의 시작) */
function hereChoice(doc: MapDocument, ctx: PlayContext): Pick<PlayPlanChoice, "at" | "note"> {
  const map = mapGeometryOf(doc);
  const events = mapEventsOf(doc);
  const primary = eventsStateOf(doc)?.primary ?? null;
  let skipped = "";
  if (primary !== null) {
    const r = eventPlayPlan(map, events, primary, "play");
    if (r.ok) return r.plan;
    skipped = `${r.reason}. `;
  }
  const places: Array<[string, { x: number; y: number } | null]> = [
    ["커서", ctx.cursor],
    ["뷰 가운데", ctx.viewCenter],
  ];
  for (const [label, p] of places) {
    const cell = p ? cellAt(doc, p) : null;
    if (!cell) continue;
    const r = herePlayPlan(map, events, cell);
    if (r.ok) return { at: r.plan.at, note: `${skipped}${label} ${r.plan.note}` };
  }
  return { at: null, note: `${skipped}정의 파일의 시작` };
}

/** 여기서 실행의 제공자 (타일맵의 registerPlayProvider 에 넘긴다) */
export function rpgPlayProvider(sources: RpgPlaySources): PlayProviderSpec {
  return {
    id: RPG_PLAY_PROVIDER_ID,
    priority: RPG_PLAY_PRIORITY,
    applies: (doc) => targetOf(sources, doc).ok,
    hint: (doc) => {
      const t = targetOf(sources, doc);
      return t.ok ? undefined : t.reason;
    },
    plan: (doc, ctx) => {
      const t = targetOf(sources, doc);
      if (!t.ok) return null;
      const choice = hereChoice(doc, ctx);
      const state = startStateOf(sources, doc);
      return toPlan(planEnv(t.play, { map: t.entry.name, at: choice.at, state: state.text }), choice, state.note);
    },
  };
}

/** 이 이벤트 앞에서 실행과 자동 재생의 계획. 못 띄우면 이유 */
export function eventPlay(sources: RpgPlaySources, doc: MapDocument, index: number, mode: EventPlayMode): PlayPlan | string {
  const t = targetOf(sources, doc);
  if (!t.ok) return t.reason ?? "rpg-game.json 이 없어 RPG 로 실행하지 않는다";
  const r = eventPlayPlan(mapGeometryOf(doc), mapEventsOf(doc), index, mode);
  if (!r.ok) return r.reason;
  const state = startStateOf(sources, doc);
  const target = { map: t.entry.name, at: r.plan.at, state: state.text };
  const env = mode === "probe" ? probeEnv(t.play, { ...target, route: r.plan.route ?? "" }) : planEnv(t.play, target);
  return toPlan(env, r.plan, state.note);
}

/** 이 이벤트로 띄울 수 없는 이유. 띄울 수 있으면 undefined */
export function eventPlayBlocked(sources: RpgPlaySources, doc: MapDocument, index: number, mode: EventPlayMode): string | undefined {
  const r = eventPlay(sources, doc, index, mode);
  return typeof r === "string" ? r : undefined;
}

/**
 * 타일맵의 play 에 넘길 요청. 계획은 저장한 뒤에 다시 세운다: 이벤트는 id 로 다시 찾는다 (다시 읽기를 골랐으면 디스크의 목록에서).
 * id 가 없는 이벤트는 번호 그대로다
 */
export function eventPlayRequest(sources: RpgPlaySources, doc: MapDocument, index: number, mode: EventPlayMode): PlayRequest {
  const id = field(mapEventsOf(doc)[index], "id");
  return {
    label: EVENT_PLAY_LABELS[mode],
    plan: (d) => {
      const events = mapEventsOf(d);
      const at = typeof id === "string" && id !== "" ? events.findIndex((e) => field(e, "id") === id) : index < events.length ? index : -1;
      if (at < 0) return `이벤트 ${typeof id === "string" && id !== "" ? id : `events[${index + 1}]`} 이(가) 이 맵에 없다`;
      return eventPlay(sources, d, at, mode);
    },
  };
}
