// RPG 실행 (e5 문서 5.2): 여기서 실행의 제공자(rpgPlay, priority 10), 이 이벤트 앞에서 실행과 자동 재생의 계획, 시작 상태.
// 픽스처의 항구 마을(port_town.json)과 rpg-game.json 의 play 로 본다.
import type { PlayPlan, PlayWatch } from "@initial-editor/ext-tilemap";
import { describe, expect, it } from "vitest";
import { fixtureSources, INN, layerHarness, mapText, MEADOW, PORT_TOWN, stateOf } from "../testing/layerHarness";
import { GAME_CONFIG_MISSING } from "./game";
import { eventPlay, eventPlayBlocked, eventPlayRequest, EVENT_PLAY_LABELS, probeWatch, RPG_PLAY_PRIORITY, RPG_PLAY_PROVIDER_ID, rpgPlayProvider } from "./rpgPlay";

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
    expect(provider.hint?.(meadow)).toBe("rpg-game.json 에 등록되지 않은 맵: RPG 실행 불가");
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
      note: "커서 14,40 → 15,40 (통행 불가 타일이라 가장 가까운 통행 가능 타일로 이동)",
    });
    expect(provider.plan(doc, { cursor: null, viewCenter: { x: 16 * 16 + 8, y: 24 * 16 + 8 } })).toMatchObject({ at: { x: 16, y: 24 }, note: "뷰 가운데 16,24" });
    // 맵 밖의 커서는 쓰지 않는다
    expect(provider.plan(doc, { cursor: { x: -5, y: 40 }, viewCenter: { x: 16 * 16 + 8, y: 24 * 16 + 8 } })?.note).toBe("뷰 가운데 16,24");
    expect(provider.plan(doc, NO_CTX)).toEqual({ env: { ...BASE, INITIAL2D_MAP: "port_town" }, at: null, note: "정의 파일의 시작 위치" });
    // 둘 이상 고르면 이벤트 앞이 아니다
    stateOf(doc).select([0, 2]);
    expect(provider.plan(doc, NO_CTX)?.note).toBe("정의 파일의 시작 위치");
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
    expect(plan.note).toBe("bench: 좌표가 잘못되었거나 통행 가능한 타일 없음. 커서 16,24");
  });

  it("맵마다 기억한 시작 상태를 INITIAL2D_RPG_STATE 로 넘기고, 틀린 항목이 있으면 설명에 적는다", () => {
    const { h, provider, sources } = setup();
    const doc = h.open(PORT_TOWN);
    sources.memory.set(PORT_TOWN, "arrived,item:shell=2");
    expect(provider.plan(doc, NO_CTX)).toEqual({
      env: { ...BASE, INITIAL2D_MAP: "port_town", INITIAL2D_RPG_STATE: "arrived,item:shell=2" },
      at: null,
      note: "정의 파일의 시작 위치, 시작 상태 arrived,item:shell=2",
    });
    sources.memory.set(PORT_TOWN, "arrived,item:nothing,items=1");
    expect(provider.plan(doc, NO_CTX)?.note).toBe("정의 파일의 시작 위치, 시작 상태 arrived,item:nothing,items=1, 잘못된 항목 2개는 엔진이 건너뜀");
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
    expect(noPlay.provider.hint?.(doc)).toBe("rpg-game.json 에 play 없음: RPG 실행 불가");
    const broken = setup({ game: null, gameProblem: "지원하지 않는 버전: 2" });
    expect(broken.provider.hint?.(broken.h.open(PORT_TOWN))).toBe("rpg-game.json 읽기 실패: RPG 실행 불가 (지원하지 않는 버전: 2)");
    const missing = setup({ game: null, gameProblem: GAME_CONFIG_MISSING });
    expect(missing.provider.hint?.(missing.h.open(PORT_TOWN))).toBe("rpg-game.json 없음: RPG 실행 불가");
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
    const { watch, ...probe } = eventPlay(sources, doc, i, "probe") as PlayPlan;
    expect(probe).toEqual({
      env: { ...BASE, ...at, INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "talk", INITIAL2D_RPG_HOLD: "kid" },
      at: { x: 14, y: 21 },
      note: "이벤트 kid 앞에서 결정 키 입력, 시작 상태 arrived",
    });
    // 자동 재생은 러너가 지켜본다 (실행마다 새로 만든다)
    expect(typeof watch).toBe("function");
    expect(watch!()).not.toBe(watch!());
  });

  it("touch 는 이벤트 쪽으로 한 걸음, auto 는 위치 없이 빈 경로, parallel 은 거절한다", () => {
    const { h, sources } = setup();
    const doc = h.open(PORT_TOWN);
    const door = eventPlay(sources, doc, indexOf(doc, "inn_door"), "probe") as PlayPlan;
    expect(door.env).toMatchObject({ INITIAL2D_RPG_AT: "13,30,up", INITIAL2D_RPG_ROUTE: "up" });
    const { watch, ...arrival } = eventPlay(sources, doc, indexOf(doc, "arrival"), "probe") as PlayPlan;
    expect(arrival).toEqual({ env: { ...BASE, INITIAL2D_MAP: "port_town", INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "", INITIAL2D_RPG_HOLD: "arrival" }, at: null, note: "auto 이벤트 arrival: 맵 진입 시 실행" });
    expect(typeof watch).toBe("function");
    const st = stateOf(doc);
    const i = indexOf(doc, "bench");
    st.run((ed) => ed.setField(i, "trigger", "parallel"));
    expect(eventPlayBlocked(sources, doc, i, "probe")).toBe("parallel 이벤트는 종료되지 않음 (자동 재생 불가)");
    expect(eventPlayBlocked(sources, doc, i, "play")).toBeUndefined();
  });

  it("자동 재생은 play.env에 trace가 없어도 INITIAL2D_RPG_TRACE=1을 넣고, play.probe의 {event}를 이벤트 id로 채운다", () => {
    const { h, sources } = setup();
    const doc = h.open(PORT_TOWN);
    const game = sources.game!;
    const env = Object.fromEntries(Object.entries(game.play!.env).filter(([k]) => k !== "INITIAL2D_RPG_TRACE"));
    const probe = { ...game.play!.probe, INITIAL2D_RPG_HOLD: "{event}", INITIAL2D_RPG_TRACE: "0" };
    sources.set({ game: { ...game, play: { env, probe } } });
    const i = indexOf(doc, "kid");
    expect((eventPlay(sources, doc, i, "probe") as PlayPlan).env).toMatchObject({ INITIAL2D_RPG_TRACE: "1", INITIAL2D_RPG_HOLD: "kid", INITIAL2D_RPG_ROUTE: "talk" });
    // 손으로 하는 실행은 지켜보지 않으므로 프로젝트의 변수 그대로다
    expect((eventPlay(sources, doc, i, "play") as PlayPlan).env).not.toHaveProperty("INITIAL2D_RPG_TRACE");
  });

  it("배회하는 이벤트의 알림: 실행 변수가 그 이벤트를 세우지 않으면(INITIAL2D_RPG_HOLD 없음) 설명과 실패 알림에 까닭을 적고, 세우면 적지 않는다", () => {
    const { h, sources } = setup();
    const doc = h.open(PORT_TOWN);
    const i = indexOf(doc, "kid");
    const WANDER = "배회하는 이벤트라 원래 위치를 벗어나면 자동 재생이 도달하지 못할 수 있습니다";
    const failure = (plan: PlayPlan) => {
      const w = plan.watch!();
      w.line("rpg:map:port_town events:17 skipped:0");
      return w.exit?.(0) ?? "";
    };
    // 엔진의 play.probe 는 {event} 로 이 이벤트를 세운다 (INITIAL2D_RPG_HOLD)
    const game = sources.game!;
    expect(game.play!.probe.INITIAL2D_RPG_HOLD).toBe("{event}");
    const { INITIAL2D_RPG_HOLD: _hold, ...unheld } = game.play!.probe;
    sources.set({ game: { ...game, play: { ...game.play!, probe: unheld } } });
    const loose = eventPlay(sources, doc, i, "probe") as PlayPlan;
    expect(loose.env).not.toHaveProperty("INITIAL2D_RPG_HOLD");
    expect(loose.note).toBe(`이벤트 kid 앞에서 결정 키 입력, ${WANDER}`);
    expect(failure(loose)).toContain("배회하는 이벤트라 앞의 auto 이벤트를 실행하는 동안 원래 위치를 벗어났을 수 있습니다");
    sources.set({ game });
    const held = eventPlay(sources, doc, i, "probe") as PlayPlan;
    expect(held.env.INITIAL2D_RPG_HOLD).toBe("kid");
    expect(held.note).toBe("이벤트 kid 앞에서 결정 키 입력");
    expect(failure(held)).toBe("자동 재생이 종료되었지만 이벤트 kid 실행을 확인하지 못했습니다 (rpg:event:kid 줄이 없습니다).");
    // 다른 값으로 세우면(다른 이벤트) 이 이벤트는 여전히 배회한다
    sources.set({ game: { ...game, play: { ...game.play!, probe: { ...game.play!.probe, INITIAL2D_RPG_HOLD: "captain" } } } });
    expect((eventPlay(sources, doc, i, "probe") as PlayPlan).note).toContain(WANDER);
  });

  it("2^53을 넘는 id 는 글이 아니라 이름으로 쓰지 않는다: 설명과 요청은 events[n] 이고 표식 글이 새지 않는다", () => {
    const { h, sources } = setup();
    const data = JSON.parse(mapText(PORT_TOWN)) as { events: Array<Record<string, unknown>> };
    const k = data.events.findIndex((e) => e.id === "captain");
    const text = JSON.stringify(data).replace('"id":"captain"', '"id":12345678901234567890');
    const doc = h.open(PORT_TOWN, text);
    const plan = eventPlay(sources, doc, k, "probe") as PlayPlan;
    expect(plan.note).toBe(`이벤트 events[${k + 1}] 앞에서 결정 키 입력`);
    expect(JSON.stringify(plan)).not.toContain("INT:");
    const req = eventPlayRequest(sources, doc, k, "play");
    expect((req.plan(doc) as PlayPlan).note).toBe(`이벤트 events[${k + 1}] 앞`);
    stateOf(doc).run((ed) => ed.removeEvents([k]));
    // id 가 없으니 번호로 찾는다: 번호의 이벤트가 바뀌어 다른 이벤트 앞이다 (표식 글로 찾지 않는다)
    expect(JSON.stringify(req.plan(doc))).not.toContain("INT:");
  });

  it("등록되지 않은 맵이나 play 가 없으면 이유를 준다", () => {
    const { h, sources } = setup();
    const inn = h.open(INN);
    expect(eventPlayBlocked(sources, inn, 0, "play")).toBeUndefined();
    sources.set({ game: { ...sources.game!, play: null } });
    expect(eventPlayBlocked(sources, inn, 0, "play")).toBe("rpg-game.json 에 play 없음: RPG 실행 불가");
    const flappy = setup({ game: null, gameProblem: GAME_CONFIG_MISSING, schemaPresent: false });
    expect(eventPlay(flappy.sources, flappy.h.open(PORT_TOWN), 0, "play")).toBe("rpg-game.json 없음: RPG 실행 불가");
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
    expect((req.plan(doc) as PlayPlan).note).toBe("이벤트 kid 앞에서 결정 키 입력");
    st.run((ed) => ed.removeEvents([st.section.indexOfId("kid")]));
    expect(req.plan(doc)).toBe("이 맵에 없는 이벤트: kid");
  });
});

describe("자동 재생 지켜보기 (probeWatch)", () => {
  // 엔진의 trace 줄: 배가 떠나는 대사 뒤 타이틀로 나가고 자동 시연이 새 게임을 연다
  const SHIP_RUN = [
    "rpg:map:port_town events:17 skipped:0",
    "rpg:player:port_town,17,44,right",
    "rpg:event:arrival",
    "rpg:message:선장|짐은 다 내렸네.",
    "rpg:event:ship",
    "rpg:choice:지금 떠난다|조금 더 둘러본다",
    "rpg:message:|배는 저녁 물때에 항구를 떠났다.",
    "rpg:map:port_town events:17 skipped:0",
    "rpg:player:port_town,17,44,right",
  ];

  function feed(watch: PlayWatch, lines: readonly string[]): { at: number; reason: string } | null {
    for (let k = 0; k < lines.length; k++) {
      const reason = watch.line(lines[k]);
      if (reason) return { at: k, reason };
    }
    return null;
  }

  it("transfer 없이 맵을 다시 열면(새 게임) 그 줄에서 멈출 이유를 준다", () => {
    const stop = feed(probeWatch("ship"), SHIP_RUN);
    expect(stop?.at).toBe(7);
    expect(stop?.reason).toBe("자동 재생을 중단했습니다. 이벤트 ship 실행 뒤 씬 전환 커맨드로 게임이 새 게임으로 다시 시작되었습니다. 자동 재생 결과는 위 줄까지입니다.");
    // 이벤트가 돌기 전이면 그렇게 말한다
    const early = feed(probeWatch("kid"), SHIP_RUN);
    expect(early?.reason).toBe("자동 재생을 중단했습니다. 이벤트 kid 실행 전에 게임이 새 게임으로 다시 시작되었습니다.");
  });

  it("transfer 로 다른 맵을 여는 것은 다시 시작이 아니다. 핫 리로드 뒤의 첫 맵도 아니다", () => {
    const watch = probeWatch("door");
    const lines = ["rpg:map:port_town events:17 skipped:0", "rpg:event:door", "rpg:transfer:inn,9,11,down", "rpg:map:inn events:6 skipped:0", "rpg:transfer:port_town,13,30,down", "  rpg:map:port_town events:17 skipped:0  "];
    expect(feed(watch, lines)).toBeNull();
    watch.restarted?.();
    expect(watch.line("rpg:map:port_town events:17 skipped:0")).toBeUndefined();
    expect(watch.line("rpg:map:port_town events:17 skipped:0")).toBeDefined();
  });

  it("코드 0 으로 끝났는데 rpg:event:<id> 가 없었으면 실패를 알린다 (배회하면 까닭도). 정지와 오류 종료는 알리지 않는다", () => {
    const kid = probeWatch("kid", { wanders: true });
    feed(kid, ["rpg:map:port_town events:17 skipped:0", "rpg:player:port_town,14,21,up", "rpg:event:arrival", "rpg:route:done"]);
    const failure = kid.exit?.(0) ?? "";
    expect(failure.startsWith("자동 재생이 종료되었지만 이벤트 kid 실행을 확인하지 못했습니다 (rpg:event:kid 줄이 없습니다).")).toBe(true);
    expect(failure).toContain("배회하는 이벤트라 앞의 auto 이벤트를 실행하는 동안 원래 위치를 벗어났을 수 있습니다");
    expect(kid.exit?.(null)).toBeUndefined();
    expect(kid.exit?.(1)).toBeUndefined();
    const plain = probeWatch("crates");
    feed(plain, ["rpg:map:port_town events:17 skipped:0", "rpg:route:done"]);
    expect(plain.exit?.(0)).toBe("자동 재생이 종료되었지만 이벤트 crates 실행을 확인하지 못했습니다 (rpg:event:crates 줄이 없습니다).");
    const ran = probeWatch("kid", { wanders: true });
    feed(ran, ["rpg:map:port_town events:17 skipped:0", "rpg:event:kid", "rpg:route:done"]);
    expect(ran.exit?.(0)).toBeUndefined();
    // 이름 없는 이벤트는 돌았는지 알 수 없어 알리지 않는다
    expect(probeWatch(null).exit?.(0)).toBeUndefined();
  });
});
