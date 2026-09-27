// 이벤트 레이어의 명세 (e5 문서 2.2, 2.4): 모델의 붙이기 규칙(eventsLayerCore)에 뷰, 도구, 인스펙터를 더한다.
// 확장의 activate 가 타일맵의 registerMapLayer 에 넘긴다.

import type { MapLayerSpec } from "@initial-editor/ext-tilemap";
import { eventsLayerCore } from "../model/layer";
import { makeEventInspector } from "./EventInspector";
import { EventsLayerView } from "./EventsLayerView";
import { EventsTool } from "./eventsTool";
import type { RpgUiServices } from "./services";

export function createEventsLayer(services: RpgUiServices): MapLayerSpec {
  return {
    ...eventsLayerCore(services.store),
    createView: (ctx) => new EventsLayerView(ctx, { fileExists: () => services.store.fileExists ?? null }),
    createTool: (ctx) => new EventsTool(ctx, services.clipboard),
    Inspector: makeEventInspector(services),
  };
}
