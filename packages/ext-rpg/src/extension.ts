// RPG 확장 (docs/plans/e5-rpg.md 2.4, 5.2). 타일맵 확장이 여는 자리에 이벤트 레이어와 실행 제공자를 붙이고, 이벤트 목록 패널과
// 이벤트 실행 명령을 등록한다.
//   - 프로젝트의 event-commands.json, rpg-game.json, 아이템 표를 읽고 바뀌면 다시 읽는다 (RpgProjectStore).
//     읽기가 끝날 때마다 refreshLayer 로 열린 맵에 레이어를 붙이거나 새로 고친다
//   - 스키마 파일이 없는 프로젝트(플래피)에서는 레이어 줄도 힌트도 나오지 않는다
//   - 복사, 붙여넣기, 복제, 지우기는 커맨드가 아니라 레이어 도구의 키다 (전역 edit.* 와 겹치지 않는다)
//   - 여기서 실행(Ctrl+F5)은 rpgPlay 제공자(priority 10)가 받는다. 이 이벤트 앞에서 실행과 자동 재생은 고른 이벤트 하나에 걸리는
//     명령(맵 메뉴, 인스펙터의 단추, 목록의 우클릭)이고 타일맵의 실행 길(play)로 띄운다. 앱이 저장할지 묻고 러너에 넘긴다

import type { Extension, ExtensionApi } from "@initial-editor/core";
import { TILEMAP_EXTENSION_ID, type MapLayerSpec, type TilemapApi } from "@initial-editor/ext-tilemap";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { EVENTS_LAYER_ID, eventsStateOf } from "./model/layer";
import { EVENT_PLAY_LABELS, eventPlayBlocked, eventPlayRequest, rpgPlayProvider, type EventPlayMode } from "./model/rpgPlay";
import { RpgProjectStore } from "./projectStore";
import { commandClipboard } from "./ui/clipboard";
import { EventClipboard } from "./ui/eventClipboard";
import { createEventsLayer } from "./ui/eventsLayer";
import { makeEventsPanel } from "./ui/EventsPanel";
import { ImageUrls, type RpgPlayActions, type RpgUiServices } from "./ui/services";

export const RPG_EXTENSION_ID = "rpg";
export const EVENTS_PANEL_ID = "rpg.events";
/** 이벤트 실행 명령 (맵 메뉴) */
export const EVENT_PLAY_COMMAND_IDS: Readonly<Record<EventPlayMode, string>> = { play: "rpg.playEvent", probe: "rpg.probeEvent" };
const EVENT_PLAY_MENU_ORDER: Readonly<Record<EventPlayMode, number>> = { play: 910, probe: 920 };

/** 확장의 내보내기 (다른 확장과 테스트가 exportsOf 로 받는다) */
export interface RpgExports {
  store: RpgProjectStore;
  layer: MapLayerSpec;
  services: RpgUiServices;
}

export const rpgExtension: Extension = {
  id: RPG_EXTENSION_ID,
  name: "RPG 이벤트",
  dependsOn: [TILEMAP_EXTENSION_ID],
  activate(api: ExtensionApi): RpgExports {
    const tilemap = api.exportsOf<TilemapApi>(TILEMAP_EXTENSION_ID);
    const ws = api.workspace;
    const store = new RpgProjectStore({ workspace: ws, onChange: () => tilemap.refreshLayer(EVENTS_LAYER_ID) });
    const images = new ImageUrls(() => ws.backend());
    const offImages = ws.project.onFileChange((e) => images.invalidate(e.path));
    api.onDeactivate(() => {
      offImages();
      images.dispose();
      store.dispose();
    });
    const play: RpgPlayActions = {
      blocked: (doc, index, mode) => tilemap.playBlocked() ?? eventPlayBlocked(store, doc, index, mode),
      run: async (doc, index, mode) => {
        const reason = eventPlayBlocked(store, doc, index, mode);
        if (reason) {
          ws.toasts.warn(reason);
          return false;
        }
        return tilemap.play(doc, eventPlayRequest(store, doc, index, mode));
      },
    };
    const services: RpgUiServices = {
      store,
      play,
      documents: ws.documents,
      clipboard: new EventClipboard(),
      commandClipboard,
      imageUrl: images.url,
      notify: (message) => ws.toasts.warn(message),
    };
    const layer = createEventsLayer(services);
    api.onDeactivate(tilemap.registerMapLayer(layer));
    api.onDeactivate(tilemap.registerPlayProvider(rpgPlayProvider(store)));
    /** 활성 맵에서 하나만 고른 이벤트 */
    const selectedEvent = (): { doc: MapDocument; index: number } | null => {
      const doc = ws.documents.active;
      if (!(doc instanceof MapDocument)) return null;
      const index = eventsStateOf(doc)?.primary ?? null;
      return index === null ? null : { doc, index };
    };
    for (const mode of ["play", "probe"] as const) {
      const id = EVENT_PLAY_COMMAND_IDS[mode];
      api.registerCommand({
        id,
        label: EVENT_PLAY_LABELS[mode],
        category: "map",
        enabled: () => {
          const t = selectedEvent();
          return t !== null && play.blocked(t.doc, t.index, mode) === undefined;
        },
        run: async () => {
          const t = selectedEvent();
          if (t) await play.run(t.doc, t.index, mode);
        },
      });
      api.registerMenu({ path: `맵/${EVENT_PLAY_LABELS[mode]}`, commandId: id, order: EVENT_PLAY_MENU_ORDER[mode] });
    }
    api.registerPanel({
      id: EVENTS_PANEL_ID,
      title: "이벤트",
      Component: makeEventsPanel({ services, hint: (doc) => layer.hint?.(doc) }),
      defaultDock: "left",
      presets: ["tilemap"],
    });
    return { store, layer, services };
  },
};
