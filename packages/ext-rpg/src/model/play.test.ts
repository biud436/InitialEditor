import { describe, expect, it } from "vitest";
import { fixtureGame, fixtureItems, fixtureMap } from "../testing/fixtures";
import {
  cellsByDistance,
  eventPlayPlan,
  facing,
  fillPlayEnv,
  frontCell,
  herePlayPlan,
  isBlockingEvent,
  isStandable,
  nearestStandable,
  parseStartState,
  planEnv,
  probeEnv,
  readPlayMemory,
  startStateValue,
  writePlayMemory,
} from "./play";
import { itemIds } from "./game";
import type { MapGeometry } from "./validate";

/** 7x5 맵. # 은 막힘 */
function grid(rows: string[]): MapGeometry {
  return { width: rows[0].length, height: rows.length, collision: rows.join("").split("").map((c) => (c === "#" ? 1 : 0)) };
}

const npc = (id: string, x: number, y: number, more: Record<string, unknown> = {}) => ({ id, x, y, charset: { set: "npc", index: 0 }, ...more });

describe("설 수 있는 칸과 막는 이벤트", () => {
  it("엔진 Event:isSolid: solid 가 있으면 그 값, 없으면 외형이 있고 through 가 아니면", () => {
    expect(isBlockingEvent(npc("a", 0, 0))).toBe(true);
    expect(isBlockingEvent(npc("a", 0, 0, { through: true }))).toBe(false);
    expect(isBlockingEvent({ id: "b", x: 0, y: 0 })).toBe(false);
    expect(isBlockingEvent({ id: "b", x: 0, y: 0, solid: true })).toBe(true);
    expect(isBlockingEvent(npc("a", 0, 0, { solid: false }))).toBe(false);
    expect(isBlockingEvent(null)).toBe(false);
  });

  it("맵 안, 통행 0, 막는 이벤트 없음", () => {
    const map = grid([".#.", "..."]);
    const events = [npc("a", 0, 1), { id: "sign", x: 2, y: 1 }];
    expect(isStandable(map, events, { x: 0, y: 0 })).toBe(true);
    expect(isStandable(map, events, { x: 1, y: 0 })).toBe(false);
    expect(isStandable(map, events, { x: 0, y: 1 })).toBe(false);
    expect(isStandable(map, events, { x: 2, y: 1 })).toBe(true);
    expect(isStandable(map, events, { x: 3, y: 0 })).toBe(false);
    expect(isStandable({ width: 2, height: 2, collision: null }, [], { x: 1, y: 1 })).toBe(true);
  });

  it("넓이 우선: 같은 거리면 아래, 왼쪽, 오른쪽, 위 순서", () => {
    const map = grid([".....", ".....", "....."]);
    const order = [...cellsByDistance(map, { x: 2, y: 1 })].slice(0, 5).map((c) => `${c.x},${c.y}`);
    expect(order).toEqual(["2,1", "2,2", "1,1", "3,1", "2,0"]);
    const blocked = grid(["..#..", ".###.", "..#.."]);
    // 가운데(2,1)가 막혔다: 아래(2,2)도 막혔고 왼쪽(1,1)도, 오른쪽(3,1)도, 위(2,0)도 막혔다. 다음 거리의 첫 칸은 아래의 왼쪽
    expect(nearestStandable(blocked, [], { x: 2, y: 1 })).toEqual({ x: 1, y: 2 });
    expect(nearestStandable(grid(["##"]), [], { x: 0, y: 0 })).toBeNull();
    // 맵 밖 시작은 맵 안으로 당긴다
    expect(nearestStandable(map, [], { x: -3, y: 9 })).toEqual({ x: 0, y: 2 });
  });

  it("바라보는 방향 (엔진 turnToward)", () => {
    expect(facing({ x: 1, y: 1 }, { x: 3, y: 2 })).toBe("right");
    expect(facing({ x: 1, y: 1 }, { x: 0, y: 1 })).toBe("left");
    expect(facing({ x: 1, y: 1 }, { x: 2, y: 3 })).toBe("down");
    expect(facing({ x: 1, y: 1 }, { x: 2, y: 0 })).toBe("up");
    expect(facing({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe("down");
  });
});

describe("앞 칸", () => {
  it("항구 마을의 crates(14,40): 아래와 왼쪽이 막혀 15,40 에서 왼쪽을 본다 (엔진 test_rpg_play_here 와 같다)", () => {
    const { map } = fixtureMap("port_town");
    const events = map.events!;
    const i = events.findIndex((e) => (e as { id: string }).id === "crates");
    expect(frontCell(map, events, i)).toEqual({ x: 15, y: 40, dir: "left", adjacent: true });
  });

  it("외형과 dir 이 있으면 그 이벤트가 바라보는 칸이 먼저, 막혔으면 아래, 왼쪽, 오른쪽, 위", () => {
    const map = grid([".....", ".....", "....."]);
    expect(frontCell(map, [npc("a", 2, 1, { dir: "up" })], 0)).toEqual({ x: 2, y: 0, dir: "down", adjacent: true });
    expect(frontCell(map, [npc("a", 2, 1, { dir: "right" })], 0)).toEqual({ x: 3, y: 1, dir: "left", adjacent: true });
    // 외형이 없으면 dir 을 보지 않는다
    expect(frontCell(map, [{ id: "a", x: 2, y: 1, dir: "up" }], 0)).toEqual({ x: 2, y: 2, dir: "up", adjacent: true });
    // 바라보는 칸이 막혔으면 순서대로
    expect(frontCell(map, [npc("a", 2, 1, { dir: "up" }), npc("b", 2, 0)], 0)).toEqual({ x: 2, y: 2, dir: "up", adjacent: true });
    expect(frontCell(grid(["...", "...", ".#."]), [npc("a", 1, 1)], 0)).toEqual({ x: 0, y: 1, dir: "right", adjacent: true });
  });

  it("네 칸이 다 막혔으면 가장 가까운 칸으로 넘어간다", () => {
    const map = grid([".....", "..#..", ".#.#.", "..#.."]);
    expect(frontCell(map, [{ id: "a", x: 2, y: 2 }], 0)).toMatchObject({ adjacent: false });
    expect(frontCell(map, [{ id: "a", x: 2, y: 2, solid: true }], 0)).toEqual({ x: 1, y: 3, dir: "up", adjacent: false }); // 대각선은 세로가 먼저 (turnToward)
    expect(frontCell(map, [{ id: "a", x: "b", y: 2 }], 0)).toBeNull();
    expect(frontCell(grid(["#"]), [{ id: "a", x: 0, y: 0, solid: true }], 0)).toBeNull();
  });
});

describe("시작 상태 (엔진 playenv.lua 의 parseState 와 같다)", () => {
  const items = itemIds(fixtureItems());

  it("쉼표 목록: 이름, 이름=값, item:<id>=<n>, item:<id>", () => {
    const s = parseStartState(" arrived , booked=false, silver=2, rate=-1.5, who=선장, item:shell=2, item:lamp_oil, item:shell ,,", { items });
    expect(s.errors).toEqual([]);
    expect(s.state).toEqual({ arrived: true, booked: false, silver: 2, rate: -1.5, who: "선장" });
    expect(s.items).toEqual({ shell: 3, lamp_oil: 1 });
  });

  it("틀린 항목은 이유와 함께 (엔진이 rpg:error:state 로 찍는 것과 같다)", () => {
    const s = parseStartState("item:=1, item:shell=x, item:nothing=1, =3, foo:bar, items, empty=, arrived\nitem:shell=1", { items });
    expect(s.errors.map((e) => e.entry)).toEqual(["item:=1", "item:shell=x", "item:nothing=1", "=3", "foo:bar", "items", "empty=", "arrived\nitem:shell=1"]);
    expect(s.errors.map((e) => e.message)).toEqual([
      "아이템 id 가 비었다",
      "개수가 0 이상의 정수가 아니다",
      "아이템 표에 없는 id nothing",
      "이름이 비었다",
      "모르는 접두사 (아이템은 item:<id>)",
      "items 는 소지품 자리라 쓸 수 없다",
      "값이 비었다",
      "모르는 접두사 (아이템은 item:<id>)",
    ]);
    // 아이템 표가 없으면 id 를 보지 않는다
    expect(parseStartState("item:anything=2").items).toEqual({ anything: 2 });
  });

  it("비우면 변수를 넘기지 않는다", () => {
    expect(startStateValue("  ")).toBeNull();
    expect(startStateValue(null)).toBeNull();
    expect(startStateValue(" arrived ")).toBe("arrived");
  });

  it("맵마다 기억 (.initial-editor/rpg-play.json)", () => {
    const text = writePlayMemory(new Map([["resources/maps/port_town.json", "arrived"], ["resources/maps/inn.json", " "], ["resources/maps/a.json", "x=1"]]));
    expect(JSON.parse(text)).toEqual({ version: 1, startState: { "resources/maps/a.json": "x=1", "resources/maps/port_town.json": "arrived" } });
    expect(readPlayMemory(text).get("resources/maps/port_town.json")).toBe("arrived");
    expect(readPlayMemory("{").size).toBe(0);
    expect(readPlayMemory(null).size).toBe(0);
  });
});

describe("실행 변수 (rpg-game.json 의 play)", () => {
  const play = fixtureGame().play!;

  it("이 이벤트 앞에서 실행: env 만, 시작 상태가 비었으면 STATE 를 빼고 dir 까지 넣는다", () => {
    expect(planEnv(play, { map: "port_town", at: { x: 15, y: 40, dir: "left" } })).toEqual({
      INITIAL2D_SCRIPT: "lua",
      INITIAL2D_SCENE: "rpg",
      INITIAL2D_MAP: "port_town",
      INITIAL2D_RPG_AT: "15,40,left",
      INITIAL2D_RPG_TRACE: "1",
    });
    expect(planEnv(play, { map: "port_town", at: null, state: "arrived,item:shell=1" })).toEqual({
      INITIAL2D_SCRIPT: "lua",
      INITIAL2D_SCENE: "rpg",
      INITIAL2D_MAP: "port_town",
      INITIAL2D_RPG_STATE: "arrived,item:shell=1",
      INITIAL2D_RPG_TRACE: "1",
    });
    expect(planEnv(null, { map: "x" })).toEqual({});
  });

  it("자동 재생: probe 를 더하고 빈 경로도 값이다", () => {
    expect(probeEnv(play, { map: "inn", at: null, route: "" })).toMatchObject({ INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "", INITIAL2D_MAP: "inn" });
    expect(probeEnv(play, { map: "inn", at: null, route: "" })).not.toHaveProperty("INITIAL2D_RPG_AT");
    expect(probeEnv(play, { map: "port_town", at: { x: 1, y: 2, dir: "up" }, route: "talk" })).toMatchObject({ INITIAL2D_RPG_ROUTE: "talk", INITIAL2D_RPG_AT: "1,2,up" });
    expect(probeEnv(undefined, { map: "x", route: "" })).toEqual({});
  });

  it("자동 재생은 늘 trace를 켜고 {event}는 이벤트 id다 (id가 없으면 그 변수를 넣지 않는다)", () => {
    const bare = { env: { INITIAL2D_MAP: "{rpg.map}" }, probe: { INITIAL2D_RPG_ROUTE: "{route}", INITIAL2D_RPG_HOLD: "{event}" } };
    expect(probeEnv(bare, { map: "port_town", route: "talk", event: "kid" })).toEqual({
      INITIAL2D_MAP: "port_town",
      INITIAL2D_RPG_ROUTE: "talk",
      INITIAL2D_RPG_HOLD: "kid",
      INITIAL2D_RPG_TRACE: "1",
    });
    expect(probeEnv(bare, { map: "port_town", route: "", event: null })).toEqual({ INITIAL2D_MAP: "port_town", INITIAL2D_RPG_ROUTE: "", INITIAL2D_RPG_TRACE: "1" });
    expect(probeEnv({ ...bare, probe: { INITIAL2D_RPG_TRACE: "0" } }, { map: "a", route: "" }).INITIAL2D_RPG_TRACE).toBe("1");
    expect(planEnv(bare, { map: "port_town" })).toEqual({ INITIAL2D_MAP: "port_town" });
  });

  it("자리표시자 채우기: 모르는 이름이 든 변수는 뺀다", () => {
    expect(fillPlayEnv({ A: "{a}-{b}", B: "{c}", C: "plain" }, { a: "1", b: "2" })).toEqual({ A: "1-2", C: "plain" });
  });
});

describe("실행 명령이 고르는 자리", () => {
  const map = grid([".......", ".......", ".......", "...#..."]);

  it("앞에서 실행과 자동 재생: action 은 talk, touch 는 이벤트 쪽으로 한 걸음, auto 는 위치 없이 빈 경로", () => {
    const events = [npc("talker", 1, 1, { dir: "right" }), { id: "door", x: 5, y: 1, trigger: "touch" }, { id: "intro", x: 0, y: 0, trigger: "auto" }, { id: "loop", x: 6, y: 0, trigger: "parallel" }];
    expect(eventPlayPlan(map, events, 0, "play")).toEqual({ ok: true, plan: { at: { x: 2, y: 1, dir: "left" }, route: null, note: "이벤트 talker 앞" } });
    expect(eventPlayPlan(map, events, 0, "probe")).toMatchObject({ ok: true, plan: { at: { x: 2, y: 1, dir: "left" }, route: "talk" } });
    expect(eventPlayPlan(map, events, 1, "probe")).toMatchObject({ ok: true, plan: { at: { x: 5, y: 2, dir: "up" }, route: "up" } });
    expect(eventPlayPlan(map, events, 2, "probe")).toMatchObject({ ok: true, plan: { at: null, route: "" } });
    expect(eventPlayPlan(map, events, 2, "play")).toMatchObject({ ok: true, plan: { at: { x: 0, y: 1, dir: "up" } } });
    expect(eventPlayPlan(map, events, 3, "probe")).toEqual({ ok: false, reason: "parallel 은 끝나지 않는다 (자동 재생을 할 수 없다)" });
    expect(eventPlayPlan(map, [null], 0, "play")).toMatchObject({ ok: false });
  });

  it("자동 재생이 닿지 못하는 touch 와 옆 칸이 없는 이벤트는 거절한다", () => {
    const events = [npc("ghost", 1, 1, { trigger: "touch" }), { id: "wall", x: 3, y: 3, trigger: "touch" }];
    expect(eventPlayPlan(map, events, 0, "probe")).toMatchObject({ ok: false, reason: expect.stringContaining("밟을 수 없다") });
    expect(eventPlayPlan(map, events, 1, "probe")).toMatchObject({ ok: false, reason: expect.stringContaining("막힌 칸") });
    const boxed = grid([".....", "..#..", ".#.#.", "..#.."]);
    expect(eventPlayPlan(boxed, [{ id: "in", x: 2, y: 2, solid: true }], 0, "probe")).toMatchObject({ ok: false, reason: expect.stringContaining("옆에 설 칸이 없어") });
    expect(eventPlayPlan(boxed, [{ id: "in", x: 2, y: 2, solid: true }], 0, "play")).toMatchObject({ ok: true, plan: { note: expect.stringContaining("근처") } });
  });

  it("커서나 뷰 가운데: 가장 가까운 설 수 있는 칸으로 옮기고 아래를 본다", () => {
    expect(herePlayPlan(map, [], { x: 3, y: 3 })).toEqual({ ok: true, plan: { at: { x: 2, y: 3, dir: "down" }, route: null, note: "3,3 → 2,3 (막힌 칸이라 옮겼다)" } });
    expect(herePlayPlan(map, [], { x: 1.4, y: 0.6 })).toEqual({ ok: true, plan: { at: { x: 1, y: 1, dir: "down" }, route: null, note: "1,1" } });
    expect(herePlayPlan(grid(["#"]), [], { x: 0, y: 0 })).toEqual({ ok: false, reason: "설 수 있는 칸이 없다" });
  });
});
