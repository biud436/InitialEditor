// 기본 실행 제공자: 맵 오브젝트 스키마(resources/schema/map-objects.json)의 play (priority 0, docs/plans/e5-rpg.md 2.2).
//   applies  스키마에 play 가 있고 play.maps 가 이 맵을 받는다 (play.maps 가 없으면 모든 맵)
//   hint     play.maps 가 받지 않는 이유. play 가 없으면 undefined (이 프로젝트에 해당하지 않는다)
//   plan     rules.ts 의 위치 규칙(고른 오브젝트, 커서, 뷰 가운데, 시작 지점, 맵 가운데)으로 play.env 를 채운다
// 앱이 타일맵 확장의 registerPlayProvider 로 등록한다. 확장 레이어의 제공자는 priority 를 높여 먼저 묻게 한다.

import type { PlayProviderSpec } from "@initial-editor/ext-tilemap";
import type { MapDocument, MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import { geometryOf } from "./actions";
import { buildPlayEnv, PLAY_SOURCE_LABELS, playMapRefusal, playPosition, type PlayPosition } from "./rules";

export const OBJECTS_PLAY_PROVIDER_ID = "tilemap.objects";

/** 로그에 보일 위치 설명 ("선택한 오브젝트 wolf_1, 범위 최소 X 640에서 48px 왼쪽") */
export function playPositionNote(at: PlayPosition): string {
  return [at.objectId ? `${PLAY_SOURCE_LABELS[at.source]} ${at.objectId}` : PLAY_SOURCE_LABELS[at.source], at.note].filter(Boolean).join(", ");
}

/** schemaOf 는 문서의 스키마 (문서에 아직 없으면 저장소의 것) */
export function objectsPlayProvider(schemaOf: (doc: MapDocument) => MapObjectSchema | null): PlayProviderSpec {
  const mapOf = (doc: MapDocument) => ({ name: doc.model.name, path: doc.path });
  return {
    id: OBJECTS_PLAY_PROVIDER_ID,
    priority: 0,
    applies: (doc) => {
      const schema = schemaOf(doc);
      return !!schema?.play && playMapRefusal(schema, mapOf(doc)) === null;
    },
    hint: (doc) => playMapRefusal(schemaOf(doc), mapOf(doc)) ?? undefined,
    plan: (doc, ctx) => {
      const schema = schemaOf(doc);
      const at = playPosition({ objects: doc.model.objects, selectedIds: doc.selectedIds, cursor: ctx.cursor, viewCenter: ctx.viewCenter, geometry: geometryOf(doc), schema });
      const env = buildPlayEnv(schema, mapOf(doc), at);
      return env ? { env, at: { x: at.x, y: at.y }, note: playPositionNote(at) } : null;
    },
  };
}
