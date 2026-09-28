import { describe, expect, it } from "vitest";
import { fixtureMap, fixtureSchema } from "../testing/fixtures";
import {
  childList,
  commandLocation,
  copyCommands,
  findDuplicateBlocks,
  getCommand,
  getList,
  insertCommands,
  listLocation,
  moveCommands,
  parseLocation,
  placeSuffix,
  removeCommands,
  replaceCommand,
  TreeError,
  walkCommands,
  type CommandPath,
} from "./tree";
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { field } from "./json";

const schema = fixtureSchema();

const msg = (text: string) => ({ code: "message", text });

/** 창고 이벤트처럼 중첩된 목록 */
function sample(): unknown[] {
  return [
    msg("a"),
    {
      code: "if",
      cond: { flag: "f" },
      thenDo: [msg("b"), { code: "choice", options: ["x", "y"], branches: [[msg("c")], [msg("d"), msg("e")]] }],
      elseDo: [msg("f")],
    },
    msg("g"),
  ];
}

describe("경로와 엔진 표기", () => {
  it("1부터 세는 Lua 표기", () => {
    const branch: CommandPath = { list: [{ at: 1, list: "thenDo" }, { at: 1, list: "branches", branch: 1 }], index: 0 };
    expect(commandLocation(2, branch)).toBe("events[3].commands[2].thenDo[2].branches[2][1]");
    expect(listLocation(0, [])).toBe("events[1].commands");
    expect(listLocation(0, [{ at: 1, list: "elseDo" }])).toBe("events[1].commands[2].elseDo");
    expect(childList({ list: [], index: 3 }, "branches", 0)).toEqual([{ at: 3, list: "branches", branch: 0 }]);
  });

  it("표기를 경로로 되돌린다 (인자 이름과 목록 자리는 rest 로)", () => {
    const loc = "events[3].commands[2].thenDo[2].branches[2][1]";
    expect(parseLocation(loc, schema)).toEqual({ eventIndex: 2, command: { list: [{ at: 1, list: "thenDo" }, { at: 1, list: "branches", branch: 1 }], index: 0 }, rest: "" });
    expect(parseLocation("events[1].commands[4].elseDo[2].text", schema)).toEqual({ eventIndex: 0, command: { list: [{ at: 3, list: "elseDo" }], index: 1 }, rest: ".text" });
    expect(parseLocation("events[5].commands[2].branches[1]", schema)).toEqual({ eventIndex: 4, command: { list: [], index: 1 }, rest: ".branches[1]" });
    expect(parseLocation("events[5].commands[2].face.index", schema)).toEqual({ eventIndex: 4, command: { list: [], index: 1 }, rest: ".face.index" });
    expect(parseLocation("events[5].charset.index", schema)).toEqual({ eventIndex: 4, command: null, rest: ".charset.index" });
    expect(parseLocation("events", schema)).toBeNull();
    // 엔진 표기와 서로 오간다
    const path: CommandPath = { list: [{ at: 0, list: "branches", branch: 2 }, { at: 4, list: "elseDo" }], index: 6 };
    expect(parseLocation(commandLocation(7, path), schema)!.command).toEqual(path);
  });
});

describe("읽기와 걷기", () => {
  it("getList 와 getCommand (없는 하위 목록은 빈 배열, 배열이 아닌 자리는 undefined)", () => {
    const c = sample();
    expect(getList(c, [{ at: 1, list: "thenDo" }, { at: 1, list: "branches", branch: 1 }], schema)).toEqual([msg("d"), msg("e")]);
    expect(getCommand(c, { list: [{ at: 1, list: "elseDo" }], index: 0 }, schema)).toEqual(msg("f"));
    expect(getList(c, [{ at: 0, list: "thenDo" }], schema)).toBeUndefined();
    expect(getList([{ code: "if", cond: {} }], [{ at: 0, list: "elseDo" }], schema)).toEqual([]);
    expect(getList([{ code: "if", cond: {}, thenDo: "x" }], [{ at: 0, list: "thenDo" }], schema)).toBeUndefined();
    expect(getList([{ code: "choice", options: ["a"], branches: [[]] }], [{ at: 0, list: "branches" }], schema)).toBeUndefined();
    expect(getList(undefined, [], schema)).toEqual([]);
  });

  it("엔진 Commands.walk 와 같은 순서와 경로로 훑는다 (객체인 커맨드만, 배열인 목록만)", () => {
    const seen: string[] = [];
    const list = [...sample(), null, "글", { code: "if", cond: {}, thenDo: "없다", elseDo: {} }];
    walkCommands(list, schema, (cmd, path) => {
      seen.push(`${commandLocation(0, path).replace("events[1].commands", "")} ${String(field(cmd, "text") ?? cmd.code)}`);
    });
    expect(seen).toEqual([
      "[1] a",
      "[2] if",
      "[2].thenDo[1] b",
      "[2].thenDo[2] choice",
      "[2].thenDo[2].branches[1][1] c",
      "[2].thenDo[2].branches[2][1] d",
      "[2].thenDo[2].branches[2][2] e",
      "[2].elseDo[1] f",
      "[3] g",
      "[6] if",
    ]);
  });
});

describe("고치기 (원본은 그대로)", () => {
  it("넣기: 없는 하위 목록과 가지를 만들고, 새 키는 정해진 자리에 끼운다", () => {
    const c = sample();
    const frozen = JSON.stringify(c);
    const a = insertCommands(c, [{ at: 1, list: "elseDo" }], 1, [msg("new")], schema);
    expect(getList(a, [{ at: 1, list: "elseDo" }], schema)).toEqual([msg("f"), msg("new")]);
    expect(JSON.stringify(c)).toBe(frozen);
    expect(a[0]).toBe(c[0]);
    // thenDo 가 없는 if 에 넣으면 cond 뒤, elseDo 앞에 생긴다
    const noThen = [{ code: "if", cond: { flag: "a" }, elseDo: [msg("x")] }];
    const b = insertCommands(noThen, [{ at: 0, list: "thenDo" }], 0, [msg("y")], schema);
    expect(Object.keys(b[0] as object)).toEqual(["code", "cond", "thenDo", "elseDo"]);
    // branches 가 없는 choice 는 항목 수만큼 빈 가지를 만든다
    const choice = [{ code: "choice", options: ["a", "b", "c"] }];
    const d = insertCommands(choice, [{ at: 0, list: "branches", branch: 1 }], 0, [msg("z")], schema);
    expect((d[0] as { branches: unknown[] }).branches).toEqual([[], [msg("z")], []]);
    // 가지가 모자라면 빈 가지로 채운다
    const short = [{ code: "choice", options: ["a", "b", "c"], branches: [[msg("p")]] }];
    const e = insertCommands(short, [{ at: 0, list: "branches", branch: 2 }], 0, [msg("q")], schema);
    expect((e[0] as { branches: unknown[] }).branches).toEqual([[msg("p")], [], [msg("q")]]);
  });

  it("틀린 자리는 TreeError", () => {
    const c = sample();
    expect(() => insertCommands(c, [], 9, [msg("x")], schema)).toThrow(TreeError);
    expect(() => insertCommands(c, [{ at: 0, list: "thenDo" }], 0, [msg("x")], schema)).toThrow(/thenDo 목록 없음/);
    expect(() => insertCommands([{ code: "if", thenDo: "x" }], [{ at: 0, list: "thenDo" }], 0, [msg("x")], schema)).toThrow(/thenDo: 배열이어야 합니다/);
    expect(() => insertCommands([{ code: "choice", options: ["a"] }], [{ at: 0, list: "branches" }], 0, [msg("x")], schema)).toThrow(/분기 번호가 필요합니다/);
    expect(() => removeCommands(c, [], 3, 1, schema)).toThrow(TreeError);
    expect(() => removeCommands(c, [], 1, 5, schema)).toThrow(TreeError);
    expect(() => insertCommands("x", [], 0, [], schema)).toThrow(TreeError);
    // code 가 2^53을 넘는 정수(표식 글)면 숫자 그대로 알린다
    const big = [{ code: bigIntValue("12345678901234567890") }];
    expect(() => insertCommands(big, [{ at: 0, list: "thenDo" }], 0, [msg("x")], schema)).toThrow("12345678901234567890: thenDo 목록 없음");
  });

  it("빼기와 바꾸기와 복사", () => {
    const c = sample();
    const a = removeCommands(c, [{ at: 1, list: "thenDo" }, { at: 1, list: "branches", branch: 1 }], 0, 2, schema);
    expect(getList(a, [{ at: 1, list: "thenDo" }, { at: 1, list: "branches", branch: 1 }], schema)).toEqual([]);
    const b = replaceCommand(c, { list: [], index: 2 }, msg("G"), schema);
    expect(b[2]).toEqual(msg("G"));
    const copy = copyCommands(c, [], 1, 1, schema);
    expect(copy).toEqual([c[1]]);
    expect(copy[0]).not.toBe(c[1]);
  });

  it("옮기기: 같은 목록 안, 다른 목록으로(앞 형제가 빠져 당겨지는 경우 포함), 제 안으로는 안 된다", () => {
    const c = sample();
    // 같은 목록: 첫 커맨드를 끝으로 (index 는 떼기 전 기준)
    expect(moveCommands(c, { list: [], index: 0 }, 1, { list: [], index: 3 }, schema).map((x) => field(x, "text") ?? field(x, "code"))).toEqual(["if", "g", "a"]);
    expect(moveCommands(c, { list: [], index: 2 }, 1, { list: [], index: 0 }, schema).map((x) => field(x, "text") ?? field(x, "code"))).toEqual(["g", "a", "if"]);
    // 루트의 a 를 elseDo 로: 루트에서 빠지면 if 가 [1] 이 된다
    const moved = moveCommands(c, { list: [], index: 0 }, 1, { list: [{ at: 1, list: "elseDo" }], index: 1 }, schema);
    expect(moved.map((x) => field(x, "text") ?? field(x, "code"))).toEqual(["if", "g"]);
    expect(getList(moved, [{ at: 0, list: "elseDo" }], schema)).toEqual([msg("f"), msg("a")]);
    // 안에서 밖으로
    const out = moveCommands(c, { list: [{ at: 1, list: "elseDo" }], index: 0 }, 1, { list: [], index: 0 }, schema);
    expect(out[0]).toEqual(msg("f"));
    expect(getList(out, [{ at: 2, list: "elseDo" }], schema)).toEqual([]);
    expect(() => moveCommands(c, { list: [], index: 1 }, 1, { list: [{ at: 1, list: "thenDo" }], index: 0 }, schema)).toThrow(/커맨드를 자신의 하위 목록으로 이동할 수 없습니다/);
    expect(() => moveCommands(c, { list: [], index: 0 }, 2, { list: [{ at: 1, list: "elseDo" }], index: 0 }, schema)).toThrow(/커맨드를 자신의 하위 목록으로 이동할 수 없습니다/);
  });
});

describe("같은 커맨드 묶음 찾기", () => {
  it("배의 departure() 는 두 선택지 가지에 펼쳐진 같은 목록이다", () => {
    const events = fixtureMap("port_town").map.events!;
    const ship = events.find((e) => field(e, "id") === "ship");
    const dups = findDuplicateBlocks(field(ship, "commands"), schema);
    expect(dups).toHaveLength(1);
    expect(dups[0].places.every((p) => p.kind === "list")).toBe(true);
    expect(dups[0].places.map(placeSuffix)).toEqual([".commands[1].thenDo[2].branches[1]", ".commands[1].elseDo[2].branches[1]"]);
    // 커맨드 여섯과 그 안의 if 셋의 대사
    expect(dups[0].size).toBe(9);
  });

  it("여관 주인의 handKey() 는 두 목록에 든 같은 if 커맨드다", () => {
    const events = fixtureMap("inn").map.events!;
    const found = events
      .map((e) => ({ id: field(e, "id"), dups: findDuplicateBlocks(field(e, "commands"), schema) }))
      .filter((x) => x.dups.length > 0);
    expect(found.map((f) => f.id)).toEqual(["innkeeper"]);
    const [dup] = found[0].dups;
    expect(dup.places.every((p) => p.kind === "command")).toBe(true);
    expect(dup.places.map(placeSuffix)).toEqual([".commands[1].thenDo[2]", ".commands[1].elseDo[2]"]);
    expect(dup.size).toBe(8);
  });

  it("묶음 안의 묶음은 바깥 것만, 커맨드 하나짜리 목록은 치지 않는다", () => {
    const block = [msg("x"), { code: "if", cond: { flag: "a" }, thenDo: [msg("y"), msg("z")] }];
    const list = [
      { code: "choice", options: ["a", "b"], branches: [block, block] },
      { code: "if", cond: { flag: "b" }, thenDo: [msg("only")], elseDo: [msg("only")] },
    ];
    const dups = findDuplicateBlocks(list, schema);
    expect(dups.map((d) => d.places.map(placeSuffix))).toEqual([[".commands[1].branches[1]", ".commands[1].branches[2]"]]);
    expect(findDuplicateBlocks([], schema)).toEqual([]);
  });
});
