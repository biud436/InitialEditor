// 설치본 자가 검사의 탐침 (ext-tilemap 의 MapSelftestProbe, 앱의 editor/selftest). 판정은 scripts/selftest-check.mjs 가
// 보고서와 디스크의 맵 파일로 한다.
//   describe     맵에 붙은 이벤트 레이어: 붙었는가, 잠금, 오류 수, 레이어 목록의 이벤트, 뷰가 그린 표식과 읽지 못한 외형 그림.
//                뷰가 있고 외형 그림을 다 읽었으면 ready
//   playRequest  args.event(이벤트 id)를 고르고 args.mode(play 나 probe, 기본 play)의 실행 요청을 만든다.
//                맵 메뉴의 "이 이벤트 앞에서 실행"과 "이 이벤트 자동 재생"이 만드는 요청과 같다

import type { MapLayerSpec, MapSelftestProbe } from "@initial-editor/ext-tilemap";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { field } from "./model/json";
import { EVENTS_LAYER_ID, eventsStateOf } from "./model/layer";
import { eventPlayBlocked, eventPlayRequest, type EventPlayMode } from "./model/rpgPlay";
import type { RpgProjectStore } from "./projectStore";
import type { EventsLayerView } from "./ui/EventsLayerView";

export function rpgSelftestProbe(store: RpgProjectStore, layer: MapLayerSpec, views: ReadonlyMap<MapDocument, EventsLayerView>): MapSelftestProbe {
  return {
    describe(doc) {
      if (!store.loaded) return { ready: false, loaded: false };
      const state = eventsStateOf(doc);
      if (!state) return { ready: true, loaded: true, attached: false, hint: layer.hint?.(doc) ?? null };
      const view = views.get(doc) ?? null;
      const events = state.section.list.map((ev, index) => ({
        index,
        id: field(ev, "id") ?? null,
        x: field(ev, "x") ?? null,
        y: field(ev, "y") ?? null,
        charset: field(ev, "charset") !== undefined,
      }));
      return {
        ready: view !== null && !view.loading,
        loaded: true,
        attached: true,
        locked: state.locked,
        errors: state.problems().filter((p) => p.severity === "error").length,
        tileWidth: doc.model.tileWidth,
        tileHeight: doc.model.tileHeight,
        events,
        view: view ? { drawn: view.drawn.map((d) => ({ ...d })), failedSheets: view.failedSheets } : null,
      };
    },
    playRequest(doc, args) {
      const id = args.event;
      if (typeof id !== "string" || id === "") return "args.event 값은 이벤트 id 여야 함";
      const mode = args.mode ?? "play";
      if (mode !== "play" && mode !== "probe") return `args.mode 값은 play 나 probe 여야 함 (현재: ${String(mode)})`;
      const state = eventsStateOf(doc);
      if (!state) return `이벤트 레이어 없음: ${doc.path}`;
      const index = state.section.list.findIndex((ev) => field(ev, "id") === id);
      if (index < 0) return `이 맵에 없는 이벤트: ${id}`;
      // 메뉴의 실행 명령과 같게 그 이벤트 하나를 고른 상태에서 만든다
      doc.setTarget({ kind: "ext", id: EVENTS_LAYER_ID });
      state.select([index]);
      const blocked = eventPlayBlocked(store, doc, index, mode as EventPlayMode);
      return blocked ?? eventPlayRequest(store, doc, index, mode as EventPlayMode);
    },
  };
}
