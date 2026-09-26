import { describe, expect, it } from "vitest";
import { fixtureGame, fixtureItems, fixtureSchema, fixtureText } from "../testing/fixtures";
import { defFileIds, engineProblems, hasErrors, validateEvents, type EventProblem, type ValidateContext } from "./validate";
import { itemIds } from "./game";

const schema = fixtureSchema();

describe("경로 대조 픽스처 (엔진 M2 3.4)", () => {
  const fixture = JSON.parse(fixtureText("tests/fixtures/events/invalid_events.json")) as { events: unknown[] };
  const expected = (JSON.parse(fixtureText("tests/fixtures/events/invalid_events.paths.json")) as { paths: string[] }).paths;

  it("엔진과 같은 경로 집합을 낸다", () => {
    const paths = new Set(engineProblems(fixture.events, schema).map((p) => p.path));
    const want = new Set(expected);
    expect([...paths].filter((p) => !want.has(p))).toEqual([]);
    expect([...want].filter((p) => !paths.has(p))).toEqual([]);
    // 겹친 경로가 없고, 3.2 표의 줄을 다 덮는 크기다 (엔진 픽스처가 정한다)
    expect(want.size).toBe(expected.length);
    expect(want.size).toBeGreaterThanOrEqual(100);
  });

  it("validateEvents 의 engine 무리도 같은 집합이고 오류다", () => {
    const problems = validateEvents(fixture.events, { schema });
    const engine = problems.filter((p) => p.source === "engine");
    expect(new Set(engine.map((p) => p.location))).toEqual(new Set(expected));
    expect(engine.every((p) => p.severity === "error")).toBe(true);
  });

  it("남는 이벤트는 ok 와 tail 이다", () => {
    const bad = new Set(engineProblems(fixture.events, schema).map((p) => Number(/^events\[(\d+)\]/.exec(p.path)![1])));
    const kept = fixture.events.map((ev, i) => ({ ev, i: i + 1 })).filter(({ i }) => !bad.has(i));
    expect(kept.map(({ ev }) => (ev as { id: string }).id)).toEqual(["ok", "tail"]);
  });

  it("엔진 표기와 이벤트 번호, id 를 문제에 싣는다", () => {
    const problems = validateEvents(fixture.events, { schema });
    const dup = problems.find((p) => p.location === "events[7].id")!;
    expect(dup).toMatchObject({ eventIndex: 6, eventId: "ok", source: "engine" });
    expect(dup.message).toContain("events[1]");
    expect(problems.find((p) => p.location === "events[2]")).toMatchObject({ eventIndex: 1 });
  });
});

describe("엔진과 같은 검사의 모양 규칙", () => {
  const paths = (events: unknown) => engineProblems(events, schema).map((p) => p.path);

  it("events 가 배열이 아니면 events 하나, 빈 객체는 빈 배열, 없으면 문제 없음", () => {
    expect(paths({ a: 1 })).toEqual(["events"]);
    expect(paths("x")).toEqual(["events"]);
    expect(paths({})).toEqual([]);
    expect(paths(undefined)).toEqual([]);
    expect(paths(null)).toEqual([]);
  });

  it("끝의 null 은 엔진이 보지 못한다 (칸 수에 들지 않는다), 가운데 null 은 그 자리의 오류", () => {
    const ok = { id: "a", x: 0, y: 0 };
    expect(paths([ok, null])).toEqual([]);
    expect(paths([null, ok])).toEqual(["events[1]"]);
    expect(paths([{ ...ok, commands: [{ code: "wait", ms: 1 }, null] }])).toEqual([]);
    expect(paths([{ ...ok, commands: [{ code: "choice", options: [null] }] }])).toEqual(["events[1].commands[1].options"]);
  });

  it("값이 전부 null 인 객체는 배열 자리에서 빈 배열, null 뿐인 배열은 객체 자리에서 빈 객체다", () => {
    const ok = { id: "a", x: 0, y: 0 };
    expect(paths([{ ...ok, commands: { a: null } }])).toEqual([]);
    expect(paths([{ ...ok, wander: [null] }])).toEqual([]);
    expect(paths([{ ...ok, wander: [1] }])).toEqual(["events[1].wander"]);
  });

  it("키의 null 은 없는 키다", () => {
    expect(paths([{ id: "a", x: 0, y: 0, dir: null, charset: null, commands: null }])).toEqual([]);
    expect(paths([{ id: "a", x: null, y: 0 }])).toEqual(["events[1].x"]);
    expect(paths([{ id: "a", x: 0, y: 0, commands: [{ code: "message", text: null }] }])).toEqual(["events[1].commands[1].text"]);
  });

  it("정수는 2.0 도 정수다, NaN 과 무한대는 수가 아니다", () => {
    expect(paths([{ id: "a", x: 2.0, y: 0 }])).toEqual([]);
    expect(paths([{ id: "a", x: 0, y: 0, commands: [{ code: "setVar", key: "k", value: Infinity }] }])).toEqual(["events[1].commands[1].value"]);
  });

  it("스키마 밖의 이름은 프로토타입 키에 속지 않는다", () => {
    expect(paths([{ id: "a", x: 0, y: 0, commands: [{ code: "constructor" }] }])).toEqual(["events[1].commands[1]"]);
    expect(paths([{ id: "a", x: 0, y: 0, charset: { set: "toString" } }])).toEqual(["events[1].charset.set"]);
  });
});

describe("에디터만의 검사 (픽스처 밖)", () => {
  const map = { width: 10, height: 8, collision: Array.from({ length: 80 }, (_, i) => (i === 3 * 10 + 4 ? 1 : 0)) };
  const ctx = (extra: Partial<ValidateContext> = {}): ValidateContext => ({ schema, map, game: fixtureGame(), items: itemIds(fixtureItems()), ...extra });
  const editor = (events: unknown[], extra?: Partial<ValidateContext>): Array<Pick<EventProblem, "severity" | "location" | "message">> =>
    validateEvents(events, ctx(extra))
      .filter((p) => p.source === "editor")
      .map(({ severity, location, message }) => ({ severity, location, message }));
  const at = (events: unknown[], location: string, extra?: Partial<ValidateContext>) => editor(events, extra).filter((p) => p.location === location);

  it("맵 밖과 같은 칸의 action, touch 는 오류다 (auto, parallel 은 겹쳐도 된다)", () => {
    const events = [
      { id: "a", x: 10, y: 0 },
      { id: "b", x: 1, y: 1 },
      { id: "c", x: 1, y: 1, trigger: "action" },
      { id: "d", x: 2, y: 2, trigger: "touch" },
      { id: "e", x: 2, y: 2, trigger: "touch" },
      { id: "f", x: 2, y: 2, trigger: "auto" },
      { id: "g", x: 2, y: 2, trigger: "auto" },
      { id: "h", x: 1, y: 1, trigger: "touch" },
    ];
    const problems = editor(events).filter((p) => p.severity === "error");
    expect(problems.map((p) => p.location)).toEqual(["events[1].x", "events[3]", "events[5]"]);
    expect(problems[1].message).toContain("events[2]");
    expect(hasErrors(validateEvents(events, ctx()))).toBe(true);
  });

  it("배열 끝의 null 은 에디터만의 오류다", () => {
    const ok = { id: "a", x: 0, y: 0 };
    expect(at([ok, null], "events[2]")[0].severity).toBe("error");
    expect(at([{ ...ok, commands: [{ code: "choice", options: ["a", null], branches: [[], [], null] }] }], "events[1].commands[1].options[2]")).toHaveLength(1);
    expect(at([{ ...ok, commands: [{ code: "choice", options: ["a", "b"], branches: [[], [], null] }] }], "events[1].commands[1].branches[3]")).toHaveLength(1);
    expect(at([{ ...ok, commands: [{ code: "wait", ms: 1 }, null] }], "events[1].commands[2]")).toHaveLength(1);
  });

  it("막힌 칸의 touch, 배회 구역, 외형 없는 배회는 경고다", () => {
    const events = [
      { id: "t", x: 4, y: 3, trigger: "touch" },
      { id: "w1", x: 0, y: 0, charset: { set: "npc", index: 0 }, wander: { area: { x: 8, y: 0, w: 4, h: 2 } } },
      { id: "w2", x: 5, y: 5, wander: {} },
    ];
    const warnings = editor(events).filter((p) => p.severity === "warning");
    expect(warnings.map((p) => [p.location, p.message])).toEqual([
      ["events[1]", "touch 이벤트가 막힌 칸에 있다 (밟을 수 없다)"],
      ["events[2].wander.area", "배회 구역이 맵 밖으로 나간다"],
      ["events[2].wander.area", "이벤트가 제 배회 구역 밖에 있다 (구역 안의 칸으로만 걷는다)"],
      ["events[3].wander", "외형이 없으면 배회하지 않는다"],
    ]);
  });

  it("정의 파일에 같은 id 가 있으면 경고, auto 는 몇 번째인지 알린다", () => {
    const events = [
      { id: "arrival", x: 0, y: 0, trigger: "auto" },
      { id: "crates", x: 1, y: 0 },
      { id: "later", x: 2, y: 0, trigger: "auto" },
    ];
    const problems = editor(events, { defIds: new Set(["crates"]) });
    expect(problems.find((p) => p.location === "events[2].id")).toMatchObject({ severity: "warning" });
    expect(problems.filter((p) => p.severity === "info" && p.location.endsWith(".trigger")).map((p) => p.message)).toEqual([
      expect.stringContaining("auto 중 1번째"),
      expect.stringContaining("auto 중 2번째"),
    ]);
  });

  it("커맨드: 취소 번호, 끝난 뒤의 커맨드, 없는 참조, 외형 없는 대상, 빈 조건과 두 꼴, x 나 y 하나, 모르는 걸음, 스크립트", () => {
    const events = [
      { id: "npc", x: 0, y: 0, charset: { set: "npc", index: 1 } },
      { id: "sign", x: 1, y: 0 },
      {
        id: "e",
        x: 2,
        y: 0,
        commands: [
          { code: "choice", options: ["a", "b"], cancel: 3 },
          { code: "giveItem", item: "lamp_oill" },
          { code: "moveRoute", target: "ghost", route: ["up", "turn:left", "wait:300", "jump", "turn:north", "wait:x"] },
          { code: "turn", target: "sign", dir: "up" },
          { code: "turn", target: "npc", dir: "up" },
          { code: "turn", target: "player", dir: "up" },
          { code: "if", cond: {} },
          { code: "if", cond: { flag: "a", item: "shell" } },
          { code: "if", cond: { flag: "" } },
          { code: "script", name: "boss" },
          { code: "transfer", map: "forest", x: 3 },
          { code: "message", text: "끝난 뒤" },
          { code: "transfer", map: "inn", x: 1, y: 2 },
        ],
      },
    ];
    const got = editor(events).map((p) => `${p.severity} ${p.location} ${p.message}`);
    const has = (needle: string) => expect(got.some((g) => g.includes(needle)), needle).toBe(true);
    has("warning events[3].commands[1].cancel 취소키가 고르는 항목 3 이 항목 수 2 밖이다");
    has("warning events[3].commands[2].item 아이템 표에 없는 id lamp_oill");
    has("warning events[3].commands[3].target 이 맵에 없는 이벤트 ghost");
    has("warning events[3].commands[3].route[4] 모르는 걸음 jump");
    has("warning events[3].commands[3].route[5] 모르는 걸음 turn:north");
    has("warning events[3].commands[3].route[6] 모르는 걸음 wait:x");
    has("warning events[3].commands[4].target sign 는 외형이 없어");
    has("warning events[3].commands[7].cond 비어 있는 조건이다");
    has("warning events[3].commands[8].cond 조건의 꼴이 둘 이상이다 (item, flag)");
    has("warning events[3].commands[9].cond.flag 깃발이 비었다");
    has("info events[3].commands[10] 스크립트 이름은 엔진만");
    has("warning events[3].commands[11].map rpg-game.json 에 등록되지 않은 맵 forest");
    has("warning events[3].commands[11] x 와 y 중 하나만 있다");
    has("warning events[3].commands[12] 맵 이동 뒤의 커맨드는 실행되지 않는다");
    // 걸음 셋(up, turn:left, wait:300)과 npc, player 대상과 등록된 inn 은 문제가 아니다
    expect(got.filter((g) => g.includes("route[1]") || g.includes("route[2]") || g.includes("route[3]"))).toEqual([]);
    expect(got.filter((g) => g.includes("commands[5]") || g.includes("commands[6]") || g.includes("commands[13]"))).toEqual([]);
  });

  it("스키마에 없는 키는 정보로 알리고 지우지 않는다", () => {
    const events = [{ id: "a", x: 0, y: 0, note: "메모", charset: { set: "npc", tint: 1 }, commands: [{ code: "message", text: "t", color: 2, face: { set: "npc", flip: true } }] }];
    const infos = editor(events).filter((p) => p.severity === "info").map((p) => p.location);
    expect(infos).toEqual(expect.arrayContaining(["events[1].note", "events[1].charset.tint", "events[1].commands[1].color", "events[1].commands[1].face.flip"]));
  });

  it("파일: 확장자와 있는지 (fileExists 가 있을 때만)", () => {
    const events = [
      { id: "a", x: 0, y: 0, charset: { file: "./resources/charsets/none.png" }, commands: [{ code: "playSe", file: "./resources/audio/door.mp3" }, { code: "playSe", file: "./resources/audio/door.wav" }] },
    ];
    expect(editor(events).filter((p) => p.message.includes("파일"))).toEqual([]);
    const exists = (p: string) => p === "resources/audio/door.wav";
    const got = editor(events, { fileExists: exists }).map((p) => `${p.location} ${p.message}`);
    expect(got).toEqual(expect.arrayContaining(["events[1].charset.file 프로젝트에 없는 파일 ./resources/charsets/none.png", "events[1].commands[1].file 확장자가 wav, ogg 가 아니다", "events[1].commands[1].file 프로젝트에 없는 파일 ./resources/audio/door.mp3"]));
    expect(got.filter((g) => g.startsWith("events[1].commands[2]"))).toEqual([]);
  });

  it("같은 커맨드 묶음이 두 번이면 정보", () => {
    const block = [
      { code: "message", text: "a" },
      { code: "message", text: "b" },
    ];
    const events = [{ id: "a", x: 0, y: 0, commands: [{ code: "choice", options: ["x", "y"], branches: [block, block] }] }];
    const info = editor(events).find((p) => p.message.includes("같은 커맨드 묶음"))!;
    expect(info).toMatchObject({ severity: "info", location: "events[1].commands[1].branches[1]" });
    expect(info.message).toContain("events[1].commands[1].branches[2]");
  });
});

describe("정의 파일의 id 어림", () => {
  it("id = \"...\" 꼴만, 주석은 뺀다", () => {
    const lua = `return {\n  events = {\n    { id = "elder", x = 3 },\n    { id='kid', x = 1 }, -- { id = "commented" }\n  },\n  identity = "x",\n}`;
    expect([...defFileIds(lua)].sort()).toEqual(["elder", "kid"]);
    expect(defFileIds("return { map = './a.json' }").size).toBe(0);
  });
});
