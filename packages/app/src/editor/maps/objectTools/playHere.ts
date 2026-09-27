// 여기서 실행: 활성 맵의 한 자리에서 엔진을 띄운다. 실행 제공자(타일맵 확장의 registerPlayProvider)를 priority 높은 것부터
// 묻고, 이 맵에 applies 인 첫 제공자의 plan 으로 띄운다 (docs/plans/e5-rpg.md 2.2). 변수는 러너의 기본 변수
// (INITIAL2D_HMR, INITIAL2D_SCRIPT) 뒤에 덧씌운다.
// 기본 제공자는 스키마의 play다 (playProvider.ts: play.env의 {map.name}, {map.file}, {x}, {y}, play.maps 글롭).
// 받는 제공자가 없으면: 이유(hint)를 말한 제공자가 있으면 커맨드를 켜 두고 누를 때 그 이유를 토스트와 콘솔로 알린다
// (메뉴 툴팁에도 있다). 이유도 없으면 이 프로젝트에 실행할 것이 없어 끄고 스키마에 play를 더하는 법을 보인다.
// 커서는 이 맵의 뷰에 남은 것만 쓴다. 엔진은 파일을 읽으므로 저장하지 않은 맵은 먼저 저장할지 묻는다.
// 확장이 제 명령으로 맵을 띄우는 길(타일맵의 play, 예: 레이어의 한 항목 앞에서 실행)도 같은 함수(playRequest)를 지난다.
// 계획에 watch 가 있으면 러너가 게임의 줄을 넘겨 지켜보게 한다 (자동 재생이 끝나지 않으면 멈춘다, 이벤트가 돌지 않았으면 알린다).

import { ReloadFailedError, type Document, type DocumentRegistry, type SaveOutcome } from "@initial-editor/core";
import type { PlayPlan, PlayProviderSpec, PlayRequest } from "@initial-editor/ext-tilemap";
import type { MapDocument, MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import type { ConfirmOptions } from "../../modals";
import { NO_MRUBY } from "../../runner/RunnerStore";
import { asMapDocument } from "../schemaStore";
import { cursorOf, mapSupportOf, viewCenterOf, type MapObjectHost } from "./actions";
import { objectsPlayProvider } from "./playProvider";
import { mapNameFor, NO_PLAY_HINT, PLAY_POSITION_RULE, type Point } from "./rules";

const LOG = "maps";
export const NEED_MAP_TAB = `맵 탭이 활성일 때 그 맵에서 실행한다. ${PLAY_POSITION_RULE}`;
export const PLAY_HERE_LABEL = "여기서 실행";

export interface PlayHost extends MapObjectHost {
  readonly documents: DocumentRegistry;
  readonly runner: {
    readonly unavailableReason: string | null;
    readonly startHint: string | undefined;
    start(opts: { env?: Record<string, string>; watch?: PlayPlan["watch"] }): Promise<void>;
  };
  readonly modals: { confirm(options: ConfirmOptions): Promise<boolean> };
  readonly mapSchema?: { readonly current: MapObjectSchema | null };
  /** 실행 제공자 (priority 순). 없으면 스키마의 play 하나(기본 제공자) */
  readonly tilemap?: { readonly playProviders: readonly PlayProviderSpec[] } | null;
  saveDocument(doc: Document): Promise<SaveOutcome | void>;
}

export function activeMapOf(host: { documents: DocumentRegistry }): MapDocument | null {
  return asMapDocument(host.documents.active);
}

function schemaOf(host: PlayHost, doc: MapDocument): MapObjectSchema | null {
  return doc.schema ?? host.mapSchema?.current ?? null;
}

/** 물을 제공자 (priority 순) */
export function playProvidersOf(host: PlayHost): readonly PlayProviderSpec[] {
  return host.tilemap?.playProviders ?? [objectsPlayProvider((doc) => schemaOf(host, doc))];
}

/** 이 맵을 띄울 첫 제공자. 없으면 null */
export function playProviderFor(host: PlayHost, doc: MapDocument): PlayProviderSpec | null {
  return playProvidersOf(host).find((p) => p.applies(doc)) ?? null;
}

/** 받는 제공자가 없을 때 제공자들이 말한 이유 (priority 순으로 잇는다). 아무도 말하지 않으면 null */
function refusalOf(host: PlayHost, doc: MapDocument): string | null {
  const hints = playProvidersOf(host)
    .map((p) => p.hint?.(doc))
    .filter((h): h is string => !!h);
  return hints.length > 0 ? hints.join(". ") : null;
}

/** 커맨드를 꺼 두는 이유 (러너가 못 띄운다, 맵 탭이 아니다, 이 프로젝트에 실행할 것이 없다). 켜 두면 undefined */
export function playHereDisabledReason(host: PlayHost): string | undefined {
  const reason = host.runner.unavailableReason;
  if (reason) return reason;
  const doc = activeMapOf(host);
  if (!doc) return NEED_MAP_TAB;
  if (!playProviderFor(host, doc) && refusalOf(host, doc) === null) return NO_PLAY_HINT;
  return runnerBlocked(host);
}

/** 받는 제공자가 없는 이유 (기본 제공자면 play.maps). 커맨드는 켜 두고 누르면 이 이유를 알린다. 받으면 null */
export function playHereRefusal(host: PlayHost): string | null {
  const doc = activeMapOf(host);
  if (!doc || playProviderFor(host, doc)) return null;
  return refusalOf(host, doc);
}

/** 지금 띄울 수 없는 이유: 꺼 두는 이유, 아니면 play.maps가 받지 않는 이유. 띄울 수 있으면 undefined */
export function playHereHint(host: PlayHost): string | undefined {
  return playHereDisabledReason(host) ?? playHereRefusal(host) ?? undefined;
}

/**
 * 이 문서의 맵 뷰에 남은 커서. 맵 뷰의 활성 맵이 다른 문서면 null.
 * 커서는 활성 맵의 뷰만 남기고 활성 맵이 바뀌면 비워지므로(MapSupport) 활성 맵이 곧 커서의 문서다.
 */
export function cursorFor(host: { mapSupport?: unknown }, doc: MapDocument): Point | null {
  const s = mapSupportOf(host);
  if (!s) return null;
  if ("activeMap" in s && s.activeMap !== doc) return null;
  return cursorOf(host);
}

/**
 * 러너가 지금 띄울 수 없는 이유 (여기서 실행과 확장의 실행 길). 띄울 수 있으면 undefined.
 * game.json 의 언어만 막는 이유(NO_MRUBY)면 막지 않는다: 맵의 실행 변수가 INITIAL2D_SCRIPT 를 덮을 수 있어
 * 러너가 띄울 때 덮은 값으로 다시 본다
 */
export function runnerBlocked(host: Pick<PlayHost, "runner">): string | undefined {
  const reason = host.runner.unavailableReason ?? host.runner.startHint ?? undefined;
  return reason === NO_MRUBY ? undefined : reason;
}

/** 여기서 실행. 띄웠으면 true */
export async function playHere(host: PlayHost): Promise<boolean> {
  const hint = playHereDisabledReason(host);
  if (hint) {
    host.toasts.warn(hint);
    return false;
  }
  const refusal = playHereRefusal(host);
  if (refusal) {
    host.log.warn(LOG, `여기서 실행하지 않았다: ${refusal}`);
    host.toasts.warn(refusal);
    return false;
  }
  return playRequest(host, activeMapOf(host)!, {
    label: PLAY_HERE_LABEL,
    // 저장한 뒤에 묻는다: 다시 읽기를 골랐으면 디스크의 내용으로 자리를 정한다
    plan: (doc) => playProviderFor(host, doc)?.plan(doc, { cursor: cursorFor(host, doc), viewCenter: viewCenterOf(host) }) ?? refusalOf(host, doc) ?? NO_PLAY_HINT,
  });
}

/**
 * 맵 하나를 요청대로 띄운다 (여기서 실행과 확장의 실행 길). 러너가 못 띄우면 이유를 알리고, 저장하지 않은 맵은 저장할지 묻고,
 * 저장한 뒤의 plan 으로 콘솔에 한 줄을 남기고 러너에 넘긴다. 띄웠으면 true
 */
export async function playRequest(host: PlayHost, doc: MapDocument, request: PlayRequest): Promise<boolean> {
  const blocked = runnerBlocked(host);
  if (blocked) {
    host.toasts.warn(blocked);
    return false;
  }
  if (doc.dirty) {
    const ok = await host.modals.confirm({
      title: request.label,
      message: `${doc.title} 을(를) 저장하지 않았다. 엔진은 파일을 읽으므로 저장해야 고친 내용으로 실행된다.`,
      okLabel: "저장하고 실행",
      cancelLabel: "취소",
    });
    if (!ok) return false;
    try {
      // 저장 충돌 모달에서 취소하면 실행하지 않는다. 다시 읽기를 골랐으면 디스크 내용 그대로 실행한다
      if ((await host.saveDocument(doc)) === "cancelled") return false;
    } catch (e) {
      const message =
        e instanceof ReloadFailedError ? `${doc.title} 을(를) 다시 읽지 못해 실행하지 않았다: ${e.reason}` : `${doc.title} 을(를) 저장하지 못해 실행하지 않았다: ${(e as Error).message}`;
      host.log.error(LOG, message);
      host.toasts.error(message);
      return false;
    }
  }
  const plan = request.plan(doc);
  if (typeof plan === "string") {
    host.log.warn(LOG, `${request.label}: 띄우지 않았다 (${plan})`);
    host.toasts.warn(plan);
    return false;
  }
  const vars = Object.entries(plan.env)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const at = plan.at ? ` x ${plan.at.x}, y ${plan.at.y}` : "";
  const note = plan.note ? ` (${plan.note})` : "";
  host.log.info(LOG, `${request.label}: ${mapNameFor(doc.model.name, doc.path)}${at}${note} ${vars}`);
  await host.runner.start(plan.watch ? { env: plan.env, watch: () => plan.watch!() } : { env: plan.env });
  return true;
}
