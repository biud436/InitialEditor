// RPG 실행 (docs/plans/e5-rpg.md 5.2). 타일맵의 실행 자리에 붙는 제공자와 이벤트 실행 명령의 계획이다. DOM 을 모른다.
//
//   rpgPlayProvider  여기서 실행 (Ctrl+F5). priority 10 이라 기본 제공자(map-objects.json)보다 먼저 묻는다.
//                    rpg-game.json 에 play 가 있고 이 맵이 등록되어 있으면(mapEntryFor, alt 포함) 받는다.
//                    자리: 고른 이벤트 하나가 있으면 그 앞, 없으면 커서 칸, 없으면 뷰 가운데 (가장 가까운 설 수 있는 칸, 아래를 본다).
//                    셋 다 없으면 위치 변수를 넣지 않아 정의 파일의 시작에 선다
//   eventPlay        이 이벤트 앞에서 실행(play)과 이 이벤트 자동 재생(probe, play.probe 를 더한다). 자리와 경로는 play.ts 의 eventPlayPlan
//   시작 상태         맵마다 기억한 글을 {state} 로 넘긴다. 비었으면 INITIAL2D_RPG_STATE 를 넣지 않는다
//   지켜보기         자동 재생은 러너가 게임의 줄을 넘겨 지켜보게 한다 (probeWatch: 새 게임으로 다시 시작하면 멈춘다, 이벤트가 돌지 않았으면 알린다).
//                    지켜보는 줄은 trace라 자동 재생의 변수는 늘 INITIAL2D_RPG_TRACE=1을 든다 (play.ts의 probeEnv). {event}는 이벤트 id다
// 레이어가 붙지 않은 맵(스키마를 읽는 중이거나 없다)도 맵 파일의 events 원본으로 자리를 고른다.

import type { PlayContext, PlayPlan, PlayProviderSpec, PlayRequest, PlayWatch } from "@initial-editor/ext-tilemap";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { EVENTS_SECTION } from "./events";
import { GAME_CONFIG_MISSING, itemIds, mapEntryFor, type MapEntry, type PlaySection } from "./game";
import { asList, field, isJsonText } from "./json";
import { eventsStateOf, type RpgSources } from "./layer";
import { eventPlayPlan, herePlayPlan, holdsEvent, parseStartState, planEnv, probeEnv, type Cell, type PlayPlanChoice } from "./play";
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
    if (problem && problem !== GAME_CONFIG_MISSING) return { ok: false, reason: `rpg-game.json 읽기 실패: RPG 실행 불가 (${problem})` };
    return { ok: false, reason: sources.schemaPresent ? "rpg-game.json 없음: RPG 실행 불가" : undefined };
  }
  if (!game.play) return { ok: false, reason: "rpg-game.json 에 play 없음: RPG 실행 불가" };
  const match = mapEntryFor(game, doc.path ?? "");
  if (!match) return { ok: false, reason: "rpg-game.json 에 등록되지 않은 맵: RPG 실행 불가" };
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
  return { text, note: bad > 0 ? `시작 상태 ${text}, 잘못된 항목 ${bad}개는 엔진이 건너뜀` : `시작 상태 ${text}` };
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
  return { at: null, note: `${skipped}정의 파일의 시작 위치` };
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

// ---- 자동 재생 지켜보기 ----
//
// 러너가 게임의 줄을 넘긴다 (타일맵의 PlayWatch). 두 가지를 본다.
//   다시 시작  rpg:transfer: 없이 온 두 번째 rpg:map: 은 새 게임이다. 씬을 바꾸는 커맨드(데모의 배, scene title)가 타이틀로
//              나가면 자동 시연(INITIAL2D_AUTOPLAY)이 새 게임을 열고 게임이 같은 시작 칸과 경로를 다시 걷는다. 끝나지 않으므로
//              그 자리에서 멈추고 이유를 남긴다
//   돌지 않음  게임이 코드 0 으로 끝났는데 rpg:event:<id> 가 없었으면 자동 재생이 이벤트에 닿지 못했다 (배회하는 NPC 가 앞의
//              auto 이벤트 동안 자리를 떠났다). 성공처럼 보이지 않게 알린다

/** 자동 재생을 지켜본다. eventId 가 없으면(이름 없는 이벤트) 다시 시작만 본다 */
export function probeWatch(eventId: string | null, opts: { wanders?: boolean } = {}): PlayWatch {
  let starts = 0;
  let transferring = false;
  let ran = false;
  const name = eventId ?? "(이름 없음)";
  return {
    line(text) {
      const t = text.trim();
      if (t.startsWith("rpg:transfer:")) {
        transferring = true;
      } else if (t.startsWith("rpg:map:")) {
        if (transferring) {
          transferring = false;
          return undefined;
        }
        starts++;
        if (starts < 2) return undefined;
        return ran
          ? `자동 재생을 중단했습니다. 이벤트 ${name} 실행 뒤 씬 전환 커맨드로 게임이 새 게임으로 다시 시작되었습니다. 자동 재생 결과는 위 줄까지입니다.`
          : `자동 재생을 중단했습니다. 이벤트 ${name} 실행 전에 게임이 새 게임으로 다시 시작되었습니다.`;
      } else if (eventId !== null && t === `rpg:event:${eventId}`) {
        ran = true;
      }
      return undefined;
    },
    exit(code) {
      if (code !== 0 || eventId === null || ran) return undefined;
      const why = opts.wanders
        ? " 배회하는 이벤트라 앞의 auto 이벤트를 실행하는 동안 원래 위치를 벗어났을 수 있습니다. 시작 상태에서 해당 auto 이벤트를 건너뛰거나 '이 이벤트 앞에서 실행' 기능으로 직접 실행하세요."
        : "";
      return `자동 재생이 종료되었지만 이벤트 ${eventId} 실행을 확인하지 못했습니다 (rpg:event:${eventId} 줄이 없습니다).${why}`;
    },
    restarted() {
      starts = 0;
      transferring = false;
    },
  };
}

/** 이 이벤트 앞에서 실행과 자동 재생의 계획. 못 띄우면 이유. 자동 재생은 러너가 지켜보게 한다 (probeWatch) */
export function eventPlay(sources: RpgPlaySources, doc: MapDocument, index: number, mode: EventPlayMode): PlayPlan | string {
  const t = targetOf(sources, doc);
  if (!t.ok) return t.reason ?? "rpg-game.json 없음: RPG 실행 불가";
  const events = mapEventsOf(doc);
  const r = eventPlayPlan(mapGeometryOf(doc), events, index, mode);
  if (!r.ok) return r.reason;
  const state = startStateOf(sources, doc);
  const target = { map: t.entry.name, at: r.plan.at, state: state.text };
  if (mode !== "probe") return toPlan(planEnv(t.play, target), r.plan, state.note);
  const ev = events[index];
  const id = field(ev, "id");
  const eventId = isJsonText(id) && id !== "" ? id : null;
  const env = probeEnv(t.play, { ...target, route: r.plan.route ?? "", event: eventId });
  // 배회하는 이벤트는 자리를 떠날 수 있다. 실행 변수가 그 이벤트를 세우면(INITIAL2D_RPG_HOLD) 알리지 않는다
  const wanders = field(ev, "wander") !== undefined && field(ev, "charset") !== undefined && !holdsEvent(env, eventId);
  const extra = [wanders ? "배회하는 이벤트라 원래 위치를 벗어나면 자동 재생이 도달하지 못할 수 있습니다" : null, state.note].filter((x): x is string => !!x).join(", ");
  return { ...toPlan(env, r.plan, extra || null), watch: () => probeWatch(eventId, { wanders }) };
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
  const raw = field(mapEventsOf(doc)[index], "id");
  const id = isJsonText(raw) && raw !== "" ? raw : null;
  return {
    label: EVENT_PLAY_LABELS[mode],
    plan: (d) => {
      const events = mapEventsOf(d);
      const at = id !== null ? events.findIndex((e) => field(e, "id") === id) : index < events.length ? index : -1;
      if (at < 0) return `이 맵에 없는 이벤트: ${id ?? `events[${index + 1}]`}`;
      return eventPlay(sources, d, at, mode);
    },
  };
}
