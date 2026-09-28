// @vitest-environment jsdom
// 설치본 자가 검사의 탐침 (selftest.ts): 확장의 내보내기 selftest 가 맵에 붙은 이벤트 레이어와 뷰가 그린 표식을 적고,
// 이벤트 id 로 고른 뒤 맵 메뉴의 실행 명령과 같은 요청을 만든다.
import { CommandRegistry, ExtensionHost, ExtensionRegistries, MenuRegistry } from "@initial-editor/core";
import { tilemapExtension, type MapLayerView, type MapLayerViewContext, type PlayPlan, type TilemapApi } from "@initial-editor/ext-tilemap";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { Container, TextureSource } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { rpgExtension, type RpgExports } from "./extension";
import { field } from "./model/json";
import { EVENTS_LAYER_ID, eventsStateOf } from "./model/layer";
import { eventPlayRequest } from "./model/rpgPlay";
import { memoryWorkspace } from "./testing/workspace";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const PORT = "resources/maps/port_town.json";

async function boot() {
  const m = memoryWorkspace();
  const host = new ExtensionHost({ commands: new CommandRegistry({ platform: "mac" }), menus: new MenuRegistry(), registries: new ExtensionRegistries(), workspace: m.ws });
  await host.activateAll([rpgExtension, tilemapExtension]);
  const tilemap = host.exportsOf<TilemapApi>("tilemap")!;
  const rpg = host.exportsOf<RpgExports>("rpg")!;
  return { m, tilemap, rpg };
}

async function openPort(b: Awaited<ReturnType<typeof boot>>) {
  await b.m.open();
  await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
  const doc = await MapDocument.open(b.m.backend, PORT);
  b.m.documents.open(doc);
  await vi.waitFor(() => expect(eventsStateOf(doc)).not.toBeNull());
  return doc;
}

/** 외형 그림 읽기를 손으로 끝내는 뷰 문맥 */
function viewContext(doc: MapDocument) {
  const pending: Array<() => void> = [];
  const ctx: MapLayerViewContext = {
    document: doc,
    container: new Container(),
    zoom: () => 1,
    color: () => 0,
    font: () => "sans-serif",
    loadTexture: (path) =>
      new Promise((resolve, reject) => {
        pending.push(() => (path.includes("missing") ? reject(new Error("없음")) : resolve({ texture: { source: new TextureSource({ width: 288, height: 256 }) }, width: 288, height: 256 })));
      }),
  };
  return { ctx, finishLoads: () => pending.splice(0).forEach((f) => f()) };
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("자가 검사의 탐침", () => {
  it("읽기 전에는 ready 가 아니고, 붙은 레이어의 이벤트 17개를 적으며, 뷰가 외형 그림을 다 읽어야 ready 다", async () => {
    const b = await boot();
    const probe = b.rpg.selftest;
    const early = await MapDocument.open(b.m.backend, PORT).catch(() => null);
    if (early) expect(probe.describe(early)).toEqual({ ready: false, loaded: false });

    const doc = await openPort(b);
    const noView = probe.describe(doc) as unknown as { events: Array<Record<string, unknown>> };
    expect(noView).toMatchObject({ ready: false, loaded: true, attached: true, locked: null, errors: 0, tileWidth: 16, tileHeight: 16, view: null });
    expect(noView.events).toHaveLength(17);
    expect(noView.events.find((e) => e.id === "fishmonger")).toEqual({ index: 8, id: "fishmonger", x: 13, y: 35, charset: true });

    const { ctx, finishLoads } = viewContext(doc);
    const view = b.tilemap.layers.get(EVENTS_LAYER_ID)!.createView!(ctx) as MapLayerView;
    const loading = probe.describe(doc) as { ready: boolean; view: { drawn: unknown[] } };
    expect(loading.ready).toBe(false);
    finishLoads();
    await flush();
    const ready = probe.describe(doc) as { ready: boolean; view: { drawn: Array<{ index: number; kind: string }>; failedSheets: string[] } };
    expect(ready.ready).toBe(true);
    expect(ready.view.drawn).toHaveLength(17);
    expect(ready.view.drawn.filter((d) => d.kind === "sprite")).toHaveLength(4);
    expect(ready.view.failedSheets).toEqual([]);

    view.dispose();
    expect(probe.describe(doc)).toMatchObject({ ready: false, view: null });
  });

  it("레이어가 붙지 않는 맵은 ready 이고 attached 가 거짓이며 힌트를 적는다", async () => {
    const b = await boot();
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    await b.m.backend.writeText("resources/maps/meadow.json", await b.m.backend.readText("resources/maps/inn.json"));
    const meadow = await MapDocument.open(b.m.backend, "resources/maps/meadow.json");
    const r = b.rpg.selftest.describe(meadow);
    expect(r).toMatchObject({ ready: true, attached: false });
    expect(typeof r.hint).toBe("string");
  });

  it("playRequest 는 이벤트를 고르고 맵 메뉴와 같은 요청을 만든다 (play 는 앞 칸, probe 는 지켜보기)", async () => {
    const b = await boot();
    const doc = await openPort(b);
    const probe = b.rpg.selftest;
    const req = probe.playRequest(doc, { event: "fishmonger" });
    if (typeof req === "string") throw new Error(req);
    expect(req.label).toBe("이 이벤트 앞에서 실행");
    const state = eventsStateOf(doc)!;
    expect(doc.target).toEqual({ kind: "ext", id: EVENTS_LAYER_ID });
    expect(field(state.section.list[state.primary!], "id")).toBe("fishmonger");
    const plan = req.plan(doc) as PlayPlan;
    const menu = eventPlayRequest(b.rpg.store, doc, state.primary!, "play").plan(doc) as PlayPlan;
    expect(plan.env).toEqual(menu.env);
    expect(plan.at).toEqual(menu.at);
    // 물고기 장수(13, 35)는 왼쪽을 보지만 그 칸이 막혀 오른쪽 칸에 서서 이벤트 쪽(왼쪽)을 본다
    expect(plan.env).toMatchObject({ INITIAL2D_SCENE: "rpg", INITIAL2D_MAP: "port_town", INITIAL2D_RPG_AT: "14,35,left" });
    expect(plan.watch).toBeUndefined();

    const auto = probe.playRequest(doc, { event: "fishmonger", mode: "probe" });
    if (typeof auto === "string") throw new Error(auto);
    expect(auto.label).toBe("이 이벤트 자동 재생");
    const autoPlan = auto.plan(doc) as PlayPlan;
    expect(autoPlan.env).toMatchObject({ INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_HOLD: "fishmonger" });
    expect(typeof autoPlan.watch).toBe("function");
  });

  it("id 가 없거나 없는 이벤트거나 모르는 mode 면 이유를 돌려준다", async () => {
    const b = await boot();
    const doc = await openPort(b);
    const probe = b.rpg.selftest;
    expect(probe.playRequest(doc, {})).toBe("args.event 값은 이벤트 id 여야 합니다");
    expect(probe.playRequest(doc, { event: "nobody" })).toBe("이 맵에 없는 이벤트: nobody");
    expect(probe.playRequest(doc, { event: "kid", mode: "walk" })).toBe("args.mode 값은 play 나 probe 여야 합니다 (현재: walk)");
  });
});
