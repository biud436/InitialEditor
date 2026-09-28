// 이벤트 레이어의 명세 (e5 문서 2.2, 2.4): 모델의 붙이기 규칙(eventsLayerCore)에 뷰, 도구, 인스펙터를 더한다.
// 확장의 activate 가 타일맵의 registerMapLayer 에 넘긴다. views 를 주면 문서마다 지금 붙은 뷰를 적는다 (자가 검사의 탐침이 읽는다).

import type { MapLayerSpec } from "@initial-editor/ext-tilemap";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { eventsLayerCore } from "../model/layer";
import { makeEventInspector } from "./EventInspector";
import { EventsLayerView } from "./EventsLayerView";
import { EventsTool } from "./eventsTool";
import type { RpgUiServices } from "./services";

export function createEventsLayer(services: RpgUiServices, views?: Map<MapDocument, EventsLayerView>): MapLayerSpec {
  return {
    ...eventsLayerCore(services.store),
    createView: (ctx) => {
      const doc = ctx.document;
      const view: EventsLayerView = new EventsLayerView(ctx, {
        fileExists: () => services.store.fileExists ?? null,
        disposed: () => {
          if (views?.get(doc) === view) views.delete(doc);
        },
      });
      views?.set(doc, view);
      return view;
    },
    createTool: (ctx) => new EventsTool(ctx, services.clipboard),
    Inspector: makeEventInspector(services),
  };
}
