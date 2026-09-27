// RPG 실행 (e5 문서 5.2): 여기서 실행의 제공자(rpgPlay, priority 10), 이 이벤트 앞에서 실행과 자동 재생의 계획, 시작 상태.
// 픽스처의 항구 마을(port_town.json)과 rpg-game.json 의 play 로 본다.
import type { PlayPlan } from "@initial-editor/ext-tilemap";
import { describe, expect, it } from "vitest";
import { fixtureSources, INN, layerHarness, mapText, MEADOW, PORT_TOWN, stateOf } from "../testing/layerHarness";
import { GAME_CONFIG_MISSING } from "./game";
import { eventPlay, eventPlayBlocked, eventPlayRequest, EVENT_PLAY_LABELS, RPG_PLAY_PRIORITY, RPG_PLAY_PROVIDER_ID, rpgPlayProvider } from "./rpgPlay";

const BASE = { INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg", INITIAL2D_RPG_TRACE: "1" };
const NO_CTX = { cursor: null, viewCenter: null };

function setup(over: Parameters<typeof fixtureSources>[0] = {}) {
  const h = layerHarness({ sources: fixtureSources(over) });
  const provider = rpgPlayProvider(h.sources);
  return { h, provider, sources: h.sources };
}

function indexOf(doc: ReturnType<ReturnType<typeof layerHarness>["open"]>, id: string): number {
  return stateOf(doc).section.indexOfId(id);
}

describe("rpgPlay 제공자 (여기서 실행)", () => {
  it("priority 10 이고, play 가 있고 rpg-game.json 에 등록된 맵(alt 포함)만 받는다", () => {
    const { h, provider } = setup();
    expect([provider.id, provider.priority]).toEqual([RPG_PLAY_PROVIDER_ID, RPG_PLAY_PRIORITY]);
    expect(RPG_PLAY_PRIORITY).toBeGreaterThan(0);
    expect(provider.applies(h.open(PORT_TOWN))).toBe(true);
    expect(provider.applies(h.open(INN))).toBe(true);
    const meadow = h.open(MEADOW);
    expect(provider.applies(meadow)).toBe(false);
    expect(provider.hint?.(meadow)).toBe("이 맵은 rpg-game.json 에 등록되지 않아 RPG 로 실행하지 않는다");
    expect(provider.plan(meadow, NO_CTX)).toBeNull();
    // alt 로 등록된 맵(RTP 판)도 받고 맵 이름은 항목의 이름이다 (레이어는 읽기 전용이어도 실행은 된다)
    const village = h.open("resources/maps/village_rtp.json");
    expect(provider.applies(village)).toBe(true);
    expect(provider.plan(village, NO_CTX)?.env.INITIAL2D_MAP).toBe("village");
  });

  it("고른 이벤트 하나가 있으면 그 앞 칸에서 이벤트 쪽을 보고 선다", () => {
    const { h, provider } = setup();
    const doc = h.open(PORT_TOWN);
    stateOf(doc).select([indexOf(doc, "captain")]);
    expect(provider.plan(doc, { cursor: { x: 8, y: 8 }, viewCenter: { x: 100, y: 100 } })).toEqual({
      env: { ...BASE, INITIAL2D_MAP: "port_town", INITIAL2D_RPG_AT: "16,43,down" },
      at: { x: 16, y: 43 },
      note: "이벤트 captain 앞",
    });
  });

  it("고른 것이 없으면 커서 칸, 그다음 뷰 가운데 (가장 가까운 설 수 있는 칸, 아래를 본다), 셋 다 없으면 정의 파일의 시작", () => {
    const { h, provider } = setup();
    const doc = h.open(PORT_TOWN);
    // 커서 14,40 은 짐 더미 칸(막힘)이라 옆으로 옮긴다
    expect(provider.plan(doc, { cursor: { x: 14 * 16 + 3, y: 40 * 16 + 15 }, viewCenter: { x: 16 * 16, y: 24 * 16 } })).toEqual({
      env: { ...BASE, INITIAL2D_MAP: "port_town", INITIAL2D_RPG_AT: "15,40,down" },
      at: { x: 15, y: 40 },
      note: "커서 14,40 → 15,40 (막힌 칸이라 옮겼다)",
    });
    expect(provider.plan(doc, { cursor: null, viewCenter: { x: 16 * 16 + 8, y: 24 * 16 + 8 } })).toMatchObject({ at: { x: 16, y: 24 }, note: "뷰 가운데 16,24" });
    // 맵 밖의 커서는 쓰지 않는다
    expect(provider.plan(doc, { cursor: { x: -5, y: 40 }, viewCenter: { x: 16 * 16 + 8, y: 24 * 16 + 8 } })?.note).toBe("뷰 가운데 16,24");
    expect(provider.plan(doc, NO_CTX)).toEqual({ env: { ...BASE, INITIAL2D_MAP: "port_town" }, at: null, note: "정의 파일의 시작" });
    // 둘 이상 고르면 이벤트 앞이 아니다
    stateOf(doc).select([0, 2]);
    expect(provider.plan(doc, NO_CTX)?.note).toBe("정의 파일의 시작");
  });

  it("고른 이벤트의 칸이 틀렸으면(밖에서 고친 파일) 이유를 적고 커서로 넘어간다", () => {
    const { h, provider } = setup();
    const data = JSON.parse(mapText(PORT_TOWN)) as { events: Array<Record<string, unknown>> };
    data.events.find((e) => e.id === "bench")!.x = "19";
    const doc = h.open(PORT_TOWN, JSON.stringify(data));
    const st = stateOf(doc);
    const i = indexOf(doc, "bench");
    st.select([i]);
    const plan = provider.plan(doc, { cursor: { x: 16 * 16, y: 24 * 16 }, viewCenter: null })!;
    expect(plan.at).toEqual({ x: 16, y: 24 });
    expect(plan.note).toBe("bench 의 칸이 틀렸거나 설 수 있는 칸이 없다. 커서 16,24");
  });

  it("맵마다 기억한 시작 상태를 INITIAL2D_RPG_STATE 로 넘기고, 틀린 항목이 있으면 설명에 적는다", () => {
    const { h, provider, sources } = setup();
    const doc = h.open(PORT_TOWN);
    sources.memory.set(PORT_TOWN, "arrived,item:shell=2");
    expect(provider.plan(doc, NO_CTX)).toEqual({
      env: { ...BASE, INITIAL2D_MAP: "port_town", INITIAL2D_RPG_STATE: "arrived,item:shell=2" },
      at: null,
      note: "정의 파일의 시작, 시작 상태 arrived,item:shell=2",
    });
    sources.memory.set(PORT_TOWN, "arrived,item:nothing,items=1");
    expect(provider.plan(doc, NO_CTX)?.note).toBe("정의 파일의 시작, 시작 상태 arrived,item:nothing,items=1, 틀린 항목 2개는 엔진이 건너뛴다");
    // 다른 맵의 시작 상태는 넘기지 않는다
    sources.memory.set(PORT_TOWN, "  ");
    sources.memory.set(INN, "booked");
    expect(provider.plan(doc, NO_CTX)?.env).not.toHaveProperty("INITIAL2D_RPG_STATE");
  });

  it("레이어가 붙지 않은 맵(스키마를 읽는 중)도 맵 파일의 events 로 자리를 고른다", () => {
    const { h, provider, sources } = setup({ schema: null });
    const doc = h.open(PORT_TOWN);
    expect(doc.layerState("rpg.events")).toBeNull();
    expect(provider.applies(doc)).toBe(true);
    // 선장(외형 있음) 칸 16,44 는 막는 이벤트라 커서가 그 칸이면 옆으로 옮긴다
    expect(provider.plan(doc, { cursor: { x: 16 * 16, y: 44 * 16 }, viewCenter: null })?.note).toMatch(/^커서 16,44 → /);
    expect(sources.schemaPresent).toBe(true);
  });

  it("이유: play 가 없다, 설정을 읽지 못했다, 설정이 없다. RPG 프로젝트가 아니면 말하지 않는다", () => {
    const noPlay = setup();
    noPlay.sources.set({ game: { ...noPlay.sources.game!, play: null } });
    const doc = noPlay.h.open(PORT_TOWN);
    expect(noPlay.provider.applies(doc)).toBe(false);
    expect(noPlay.provider.hint?.(doc)).toBe("rpg-game.json 에 play 가 없어 RPG 로 실행하지 않는다");
    const broken = setup({ game: null, gameProblem: "모르는 버전 2" });
    expect(broken.provider.hint?.(broken.h.open(PORT_TOWN))).toBe("rpg-game.json 을 읽지 못해 RPG 로 실행하지 않는다 (모르는 버전 2)");
    const missing = setup({ game: null, gameProblem: GAME_CONFIG_MISSING });
    expect(missing.provider.hint?.(missing.h.open(PORT_TOWN))).toBe("rpg-game.json 이 없어 RPG 로 실행하지 않는다");
    const flappy = setup({ game: null, gameProblem: GAME_CONFIG_MISSING, schema: null, schemaPresent: false });
    expect(flappy.provider.hint?.(flappy.h.open(PORT_TOWN))).toBeUndefined();
  });
});

describe("이 이벤트 앞에서 실행, 이 이벤트 자동 재생", () => {
  it("앞에서 실행은 play.env, 자동 재생은 play.probe 를 더한다 (action 은 talk)", () => {
    const { h, sources } = setup();
    const doc = h.open(PORT_TOWN);
    const i = indexOf(doc, "kid");
    sources.memory.set(PORT_TOWN, "arrived");
    const at = { INITIAL2D_MAP: "port_town", INITIAL2D_RPG_AT: "14,21,up", INITIAL2D_RPG_STATE: "arrived" };
    expect(eventPlay(sources, doc, i, "play")).toEqual({ env: { ...BASE, ...at }, at: { x: 14, y: 21 }, note: "이벤트 kid 앞, 시작 상태 arrived" });
    expect(eventPlay(sources, doc, i, "probe")).toEqual({
      env: { ...BASE, ...at, INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "talk" },
      at: { x: 14, y: 21 },
      note: "이벤트 kid 앞에서 말 걸기, 시작 상태 arrived",
    });
  });

  it("touch 는 이벤트 쪽으로 한 걸음, auto 는 위치 없이 빈 경로, parallel 은 거절한다", () => {
    const { h, sources } = setup();
    const doc = h.open(PORT_TOWN);
    const door = eventPlay(sources, doc, indexOf(doc, "inn_door"), "probe") as PlayPlan;
    expect(door.env).toMatchObject({ INITIAL2D_RPG_AT: "13,30,up", INITIAL2D_RPG_ROUTE: "up" });
    const arrival = eventPlay(sources, doc, indexOf(doc, "arrival"), "probe") as PlayPlan;
    expect(arrival).toEqual({ env: { ...BASE, INITIAL2D_MAP: "port_town", INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "" }, at: null, note: "auto 이벤트 arrival: 맵에 들어올 때 돈다" });
    const st = stateOf(doc);
    const i = indexOf(doc, "bench");
    st.run((ed) => ed.setField(i, "trigger", "parallel"));
    expect(eventPlayBlocked(sources, doc, i, "probe")).toBe("parallel 은 끝나지 않는다 (자동 재생을 할 수 없다)");
    expect(eventPlayBlocked(sources, doc, i, "play")).toBeUndefined();
  });

  it("등록되지 않은 맵이나 play 가 없으면 이유를 준다", () => {
    const { h, sources } = setup();
    const inn = h.open(INN);
    expect(eventPlayBlocked(sources, inn, 0, "play")).toBeUndefined();
    sources.set({ game: { ...sources.game!, play: null } });
    expect(eventPlayBlocked(sources, inn, 0, "play")).toBe("rpg-game.json 에 play 가 없어 RPG 로 실행하지 않는다");
    const flappy = setup({ game: null, gameProblem: GAME_CONFIG_MISSING, schemaPresent: false });
    expect(eventPlay(flappy.sources, flappy.h.open(PORT_TOWN), 0, "play")).toBe("rpg-game.json 이 없어 RPG 로 실행하지 않는다");
  });

  it("요청은 이름을 들고, 계획을 저장한 뒤의 목록에서 id 로 다시 찾는다 (사라졌으면 이유)", () => {
    const { h, sources } = setup();
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    const i = indexOf(doc, "kid");
    const req = eventPlayRequest(sources, doc, i, "probe");
    expect(req.label).toBe(EVENT_PLAY_LABELS.probe);
    expect(EVENT_PLAY_LABELS).toEqual({ play: "이 이벤트 앞에서 실행", probe: "이 이벤트 자동 재생" });
    // 앞의 이벤트를 지우면 번호가 바뀌어도 kid 를 찾는다
    st.run((ed) => ed.removeEvents([0]));
    expect((req.plan(doc) as PlayPlan).note).toBe("이벤트 kid 앞에서 말 걸기");
    st.run((ed) => ed.removeEvents([st.section.indexOfId("kid")]));
    expect(req.plan(doc)).toBe("이벤트 kid 이(가) 이 맵에 없다");
  });
});
