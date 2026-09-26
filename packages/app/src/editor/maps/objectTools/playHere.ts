// 여기서 실행: 활성 맵의 한 자리에서 엔진을 띄운다. 환경 변수는 스키마의 play.env가 정하고
// ({map.name}, {map.file}, {x}, {y}), 러너의 기본 변수(INITIAL2D_HMR, INITIAL2D_SCRIPT) 뒤에 덧씌운다.
// 스키마에 play.maps가 있으면 그 글롭에 맞는 맵에서만 켜진다 (다른 맵이면 꺼지고 이유를 안내한다).
// 위치 규칙은 rules.ts의 playPosition이다. 커서는 이 맵의 뷰에 남은 것만 쓴다.
// 엔진은 파일을 읽으므로 저장하지 않은 맵은 먼저 저장할지 묻는다.

import { ReloadFailedError, type Document, type DocumentRegistry, type SaveOutcome } from "@initial-editor/core";
import type { MapDocument, MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import type { ConfirmOptions } from "../../modals";
import { asMapDocument } from "../schemaStore";
import { cursorOf, geometryOf, mapSupportOf, viewCenterOf, type MapObjectHost } from "./actions";
import { buildPlayEnv, mapNameFor, NO_PLAY_HINT, PLAY_POSITION_RULE, PLAY_SOURCE_LABELS, playMapRefusal, playPosition, type PlayPosition, type Point } from "./rules";

const LOG = "maps";
export const NEED_MAP_TAB = `맵 탭이 활성일 때 그 맵에서 실행한다. ${PLAY_POSITION_RULE}`;

export interface PlayHost extends MapObjectHost {
  readonly documents: DocumentRegistry;
  readonly runner: {
    readonly unavailableReason: string | null;
    readonly startHint: string | undefined;
    start(opts: { env?: Record<string, string> }): Promise<void>;
  };
  readonly modals: { confirm(options: ConfirmOptions): Promise<boolean> };
  readonly mapSchema?: { readonly current: MapObjectSchema | null };
  saveDocument(doc: Document): Promise<SaveOutcome | void>;
}

export function activeMapOf(host: { documents: DocumentRegistry }): MapDocument | null {
  return asMapDocument(host.documents.active);
}

function schemaOf(host: PlayHost, doc: MapDocument): MapObjectSchema | null {
  return doc.schema ?? host.mapSchema?.current ?? null;
}

/** 실행할 수 없는 이유. 실행할 수 있으면 undefined */
export function playHereHint(host: PlayHost): string | undefined {
  const reason = host.runner.unavailableReason;
  if (reason) return reason;
  const doc = activeMapOf(host);
  if (!doc) return NEED_MAP_TAB;
  const schema = schemaOf(host, doc);
  if (!schema?.play) return NO_PLAY_HINT;
  const refusal = playMapRefusal(schema, { name: doc.model.name, path: doc.path });
  if (refusal) return refusal;
  return host.runner.startHint;
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

/** 지금 실행하면 쓸 위치 */
export function playPositionFor(host: PlayHost, doc: MapDocument): PlayPosition {
  return playPosition({
    objects: doc.model.objects,
    selectedIds: doc.selectedIds,
    cursor: cursorFor(host, doc),
    viewCenter: viewCenterOf(host),
    geometry: geometryOf(doc),
    schema: schemaOf(host, doc),
  });
}

/** 지금 실행하면 쓸 환경 변수 (스키마에 play가 없으면 null) */
export function playEnvFor(host: PlayHost, doc: MapDocument, at: PlayPosition): Record<string, string> | null {
  return buildPlayEnv(schemaOf(host, doc), { name: doc.model.name, path: doc.path }, at);
}

/** 여기서 실행. 띄웠으면 true */
export async function playHere(host: PlayHost): Promise<boolean> {
  const hint = playHereHint(host);
  if (hint) {
    host.toasts.warn(hint);
    return false;
  }
  const doc = activeMapOf(host)!;
  if (doc.dirty) {
    const ok = await host.modals.confirm({
      title: "여기서 실행",
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
  const at = playPositionFor(host, doc);
  const env = playEnvFor(host, doc, at);
  if (!env) {
    host.toasts.warn(NO_PLAY_HINT);
    return false;
  }
  const where = [at.objectId ? `${PLAY_SOURCE_LABELS[at.source]} ${at.objectId}` : PLAY_SOURCE_LABELS[at.source], at.note].filter(Boolean).join(", ");
  const vars = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  host.log.info(LOG, `여기서 실행: ${mapNameFor(doc.model.name, doc.path)} x ${at.x}, y ${at.y} (${where}) ${vars}`);
  await host.runner.start({ env });
  return true;
}
