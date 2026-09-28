// @vitest-environment jsdom
// RPG 확장의 등록 (e5 문서 2.4, 2.5): 타일맵 확장과 함께 켜면 이벤트 레이어와 목록 패널이 생기고, 프로젝트의 스키마를 읽는
// 즉시 열린 맵에 붙는다 (문서가 먼저 열려도). 등록되지 않은 맵은 힌트, 스키마 없는 프로젝트는 아무것도 없다,
// 스키마의 버전이 바뀌면 잠긴다, 확장을 끄면 레이어와 패널이 빠지고 저장 글은 그대로다.
import { CommandRegistry, ExtensionHost, ExtensionRegistries, MenuRegistry, visibleMenu } from "@initial-editor/core";
import { NO_MAP_PLAYER, tilemapExtension, type PlayPlan, type TilemapApi } from "@initial-editor/ext-tilemap";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it, vi } from "vitest";
import { EVENT_PLAY_COMMAND_IDS, EVENTS_PANEL_ID, rpgExtension, type RpgExports } from "./extension";
import { EVENTS_LAYER_ID, eventsStateOf } from "./model/layer";
import { RPG_PLAY_PROVIDER_ID } from "./model/rpgPlay";
import { EVENT_SCHEMA_PATH } from "./model/schema";
import { memoryWorkspace, rpgProjectFiles } from "./testing/workspace";

// 확장이 이벤트 레이어 뷰(PIXI)를 불러온다. jsdom 에는 캔버스 2D 가 없어 PIXI 에 null 을 준다
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

async function boot(files?: Record<string, string | Uint8Array>) {
  const m = memoryWorkspace(files);
  const registries = new ExtensionRegistries();
  const commands = new CommandRegistry({ platform: "mac" });
  const menus = new MenuRegistry();
  const host = new ExtensionHost({ commands, menus, registries, workspace: m.ws });
  await host.activateAll([rpgExtension, tilemapExtension]);
  const tilemap = host.exportsOf<TilemapApi>("tilemap")!;
  const rpg = host.exportsOf<RpgExports>("rpg")!;
  const openMap = async (path: string) => {
    const doc = await MapDocument.open(m.backend, path);
    m.documents.open(doc);
    return doc;
  };
  return { m, host, registries, commands, menus, tilemap, rpg, openMap };
}

/** 앱처럼 실행 길을 넣는다: 요청의 이름과 계획을 남긴다 */
function fakePlayer(b: Awaited<ReturnType<typeof boot>>) {
  const played: Array<{ label: string; plan: PlayPlan | string }> = [];
  let blocked: string | undefined;
  const off = b.tilemap.setPlayer({
    blocked: () => blocked,
    play: async (doc, request) => {
      played.push({ label: request.label, plan: request.plan(doc) });
      return true;
    },
  });
  return { played, off, block: (reason: string | undefined) => void (blocked = reason) };
}

describe("rpgExtension", () => {
  it("타일맵 뒤에 켜지고 레이어(N, 오브젝트 위)와 타일맵 프리셋의 목록 패널을 등록한다", async () => {
    const b = await boot();
    const layer = b.tilemap.layers.get(EVENTS_LAYER_ID)!;
    expect(layer).toMatchObject({ label: "이벤트", section: "events", toolKey: "N", order: 10 });
    expect(typeof layer.createView).toBe("function");
    expect(typeof layer.createTool).toBe("function");
    expect(layer.Inspector).toBeTruthy();
    expect(b.registries.panels.get(EVENTS_PANEL_ID)).toMatchObject({ title: "이벤트", defaultDock: "left", presets: ["tilemap"] });
    expect(b.rpg.layer).toBe(layer);
  });

  it("맵 문서가 먼저 열리고 스키마를 나중에 읽어도 레이어가 붙는다 (이벤트 17개)", async () => {
    const b = await boot();
    await b.m.backend.open("/project");
    const doc = await b.openMap("resources/maps/port_town.json");
    expect(eventsStateOf(doc)).toBeNull();
    await b.m.open();
    await vi.waitFor(() => expect(eventsStateOf(doc)).not.toBeNull());
    expect(eventsStateOf(doc)!.section.list).toHaveLength(17);
    expect(eventsStateOf(doc)!.locked).toBeNull();
  });

  it("등록되지 않은 맵은 레이어 없이 힌트, 나중에 연 등록된 맵은 바로 붙는다", async () => {
    const files = rpgProjectFiles();
    files["resources/maps/meadow.json"] = files["resources/maps/inn.json"];
    const b = await boot(files);
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    const meadow = await b.openMap("resources/maps/meadow.json");
    expect(eventsStateOf(meadow)).toBeNull();
    expect(b.rpg.layer.hint?.(meadow)).toBe("이벤트 레이어 없음 (rpg-game.json 에 등록된 맵에만 있음)");
    const inn = await b.openMap("resources/maps/inn.json");
    expect(eventsStateOf(inn)?.section.list).toHaveLength(6);
  });

  it("스키마가 없는 프로젝트(플래피)는 레이어도 힌트도 없다", async () => {
    const files = rpgProjectFiles();
    delete files[EVENT_SCHEMA_PATH];
    const b = await boot(files);
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    const doc = await b.openMap("resources/maps/port_town.json");
    expect(eventsStateOf(doc)).toBeNull();
    expect(b.rpg.layer.hint?.(doc)).toBeUndefined();
    // 메뉴도 없다 (문서 2.5): 이벤트 실행 명령 둘과 레이어 도구는 보이지 않고, 이벤트 목록 패널도 창 메뉴에 없다
    const menuCommands = () => visibleMenu(b.menus.tree(), (id) => b.commands.isVisible(id)).flatMap((n) => n.children.map((c) => c.commandId));
    for (const id of Object.values(EVENT_PLAY_COMMAND_IDS)) {
      expect(b.commands.isVisible(id)).toBe(false);
      expect(menuCommands()).not.toContain(id);
    }
    expect(b.rpg.layer.visible?.()).toBe(false);
    expect(b.registries.panels.get(EVENTS_PANEL_ID)?.visible?.()).toBe(false);
  });

  it("목록 패널의 visible은 프로젝트를 다 읽기 전에는 모름(undefined)이다 (되살린 레이아웃이 패널을 두고 기다린다)", async () => {
    const withSchema = await boot();
    const panel = () => withSchema.registries.panels.get(EVENTS_PANEL_ID)!;
    expect(panel().visible?.()).toBeUndefined();
    await withSchema.m.open();
    await vi.waitFor(() => expect(withSchema.rpg.store.loaded).toBe(true));
    expect(panel().visible?.()).toBe(true);
    const files = rpgProjectFiles();
    delete files[EVENT_SCHEMA_PATH];
    const without = await boot(files);
    expect(without.registries.panels.get(EVENTS_PANEL_ID)!.visible?.()).toBeUndefined();
    await without.m.open();
    await vi.waitFor(() => expect(without.rpg.store.loaded).toBe(true));
    expect(without.registries.panels.get(EVENTS_PANEL_ID)!.visible?.()).toBe(false);
  });

  it("RPG 프로젝트면 이벤트 명령과 레이어 도구와 목록 패널이 메뉴에 보인다", async () => {
    const b = await boot();
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    for (const id of Object.values(EVENT_PLAY_COMMAND_IDS)) expect(b.commands.isVisible(id)).toBe(true);
    expect(b.rpg.layer.visible?.()).toBe(true);
    expect(b.registries.panels.get(EVENTS_PANEL_ID)?.visible?.()).toBe(true);
  });

  it("스키마의 버전이 바뀌면 붙은 레이어가 잠기고, 되돌리면 풀린다", async () => {
    const b = await boot();
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    const doc = await b.openMap("resources/maps/port_town.json");
    const st = eventsStateOf(doc)!;
    const text = rpgProjectFiles()[EVENT_SCHEMA_PATH] as string;
    b.m.backend.simulateExternalChange(EVENT_SCHEMA_PATH, "modify", JSON.stringify({ ...JSON.parse(text), version: 2 }));
    await vi.waitFor(() => expect(st.locked).toMatch(/지원하지 않는 event-commands.json 버전: 2/));
    expect(eventsStateOf(doc)).toBe(st);
    b.m.backend.simulateExternalChange(EVENT_SCHEMA_PATH, "modify", text);
    await vi.waitFor(() => expect(st.locked).toBeNull());
  });

  it("확장을 끄면 레이어와 패널이 빠지고 편집한 값은 저장 글에 남는다", async () => {
    const b = await boot();
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    const doc = await b.openMap("resources/maps/port_town.json");
    const st = eventsStateOf(doc)!;
    expect(st.run((ed) => ed.moveEvents([0], 0, -1)).ok).toBe(true);
    const edited = doc.text();
    await b.host.deactivate("rpg");
    expect(doc.layerState(EVENTS_LAYER_ID)).toBeNull();
    expect(b.tilemap.layers.has(EVENTS_LAYER_ID)).toBe(false);
    expect(b.registries.panels.has(EVENTS_PANEL_ID)).toBe(false);
    expect(doc.text()).toBe(edited);
  });
});

describe("rpgExtension 의 실행", () => {
  const BASE = { INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg", INITIAL2D_RPG_TRACE: "1", INITIAL2D_MAP: "port_town" };

  it("실행 제공자(priority 10)와 두 명령(맵 메뉴)을 등록하고, 끄면 빠진다", async () => {
    const b = await boot();
    expect(b.tilemap.playProviders.map((p) => [p.id, p.priority])).toEqual([[RPG_PLAY_PROVIDER_ID, 10]]);
    expect(b.commands.get(EVENT_PLAY_COMMAND_IDS.play)?.label).toBe("이 이벤트 앞에서 실행");
    expect(b.commands.get(EVENT_PLAY_COMMAND_IDS.probe)?.label).toBe("이 이벤트 자동 재생");
    expect(b.menus.items.filter((i) => i.path.startsWith("맵/")).map((i) => [i.path, i.commandId])).toEqual([
      ["맵/이 이벤트 앞에서 실행", "rpg.playEvent"],
      ["맵/이 이벤트 자동 재생", "rpg.probeEvent"],
    ]);
    await b.host.deactivate("rpg");
    expect(b.tilemap.playProviders).toEqual([]);
    expect(b.commands.get(EVENT_PLAY_COMMAND_IDS.play)).toBeUndefined();
    expect(b.menus.items).toEqual([]);
  });

  it("명령은 활성 맵에서 하나만 고른 이벤트에 켜지고, 실행 길이 막히면 꺼진다", async () => {
    const b = await boot();
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    const doc = await b.openMap("resources/maps/port_town.json");
    const st = eventsStateOf(doc)!;
    const on = () => [b.commands.isEnabled(EVENT_PLAY_COMMAND_IDS.play), b.commands.isEnabled(EVENT_PLAY_COMMAND_IDS.probe)];
    expect(on()).toEqual([false, false]);
    st.select([st.section.indexOfId("kid")]);
    // 앱이 길을 넣기 전에는 이유가 NO_MAP_PLAYER 다
    expect(on()).toEqual([false, false]);
    expect(b.rpg.services.play!.blocked(doc, st.primary!, "play")).toBe(NO_MAP_PLAYER);
    const p = fakePlayer(b);
    expect(on()).toEqual([true, true]);
    p.block("엔진 탐색 실패");
    expect(on()).toEqual([false, false]);
    p.block(undefined);
    st.select([0, 1]);
    expect(on()).toEqual([false, false]);
    const bench = st.section.indexOfId("bench");
    expect(st.run((ed) => ed.setField(bench, "trigger", "parallel")).ok).toBe(true);
    st.select([bench]);
    expect(on()).toEqual([true, false]);
  });

  it("이 이벤트 자동 재생은 타일맵의 실행 길에 이름과 계획을 넘긴다 (시작 상태 포함). 앞에서 실행은 probe 없이", async () => {
    const b = await boot();
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    const doc = await b.openMap("resources/maps/port_town.json");
    const st = eventsStateOf(doc)!;
    const p = fakePlayer(b);
    await b.rpg.store.setStartState(doc.path!, "arrived");
    st.select([st.section.indexOfId("kid")]);
    await b.commands.execute(EVENT_PLAY_COMMAND_IDS.probe);
    await b.commands.execute(EVENT_PLAY_COMMAND_IDS.play);
    const at = { INITIAL2D_RPG_AT: "14,21,up", INITIAL2D_RPG_STATE: "arrived" };
    // 자동 재생의 계획은 러너가 지켜볼 것(watch)을 들고, 앞에서 실행은 들지 않는다
    const [probe, play] = p.played.map(({ label, plan }) => {
      if (typeof plan === "string") return { label, plan, watch: "none" };
      const { watch, ...rest } = plan;
      return { label, plan: rest, watch: typeof watch };
    });
    expect([probe, play]).toEqual([
      {
        label: "이 이벤트 자동 재생",
        plan: { env: { ...BASE, ...at, INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "talk", INITIAL2D_RPG_HOLD: "kid" }, at: { x: 14, y: 21 }, note: "이벤트 kid 앞에서 결정 키 입력, 시작 상태 arrived" },
        watch: "function",
      },
      { label: "이 이벤트 앞에서 실행", plan: { env: { ...BASE, ...at }, at: { x: 14, y: 21 }, note: "이벤트 kid 앞, 시작 상태 arrived" }, watch: "undefined" },
    ]);
  });

  it("못 띄우는 이벤트(parallel 의 자동 재생)는 실행 길로 가지 않고 이유를 알린다", async () => {
    const b = await boot();
    await b.m.open();
    await vi.waitFor(() => expect(b.rpg.store.loaded).toBe(true));
    const doc = await b.openMap("resources/maps/port_town.json");
    const st = eventsStateOf(doc)!;
    const p = fakePlayer(b);
    const bench = st.section.indexOfId("bench");
    st.run((ed) => ed.setField(bench, "trigger", "parallel"));
    expect(await b.rpg.services.play!.run(doc, bench, "probe")).toBe(false);
    expect(p.played).toEqual([]);
    expect(b.m.toasts).toEqual(["parallel 이벤트는 종료되지 않음 (자동 재생 불가)"]);
  });
});
