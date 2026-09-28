// 커맨드 목록의 줄: 펴기, 요약, 머리줄 이름, 접기, 문제 붙이기, 고르기와 넣을 자리
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { fixtureMap, fixtureSchema } from "../testing/fixtures";
import { field } from "../model/json";
import { validateEvents, type EventProblem } from "../model/validate";
import {
  ancestorKeys,
  branchLabel,
  buildRows,
  commandKey,
  commandSummary,
  conditionSummary,
  endKey,
  fillSummary,
  headerKey,
  headersAbove,
  insertTarget,
  isCommandProblem,
  problemsByRow,
  selectedRange,
  worstSeverity,
  type CommandRow,
  type HeaderRow,
  type TreeRow,
} from "./commandRows";

const schema = fixtureSchema();

const NESTED = [
  { code: "message", name: "주인", text: "어서 오게." },
  {
    code: "if",
    cond: { item: "warehouse_key" },
    thenDo: [{ code: "message", text: "열쇠가 있군." }],
    elseDo: [
      {
        code: "choice",
        options: ["묵는다", "나간다"],
        branches: [[{ code: "setFlag", key: "slept" }], []],
      },
    ],
  },
  { code: "wait", ms: 300 },
];

function keys(rows: readonly TreeRow[]): string[] {
  return rows.map((r) => r.key);
}

describe("buildRows", () => {
  it("커맨드, 하위 목록 머리줄, 목록 끝 줄을 트리 순서로 편다", () => {
    const rows = buildRows(NESTED, schema, new Set());
    expect(keys(rows)).toEqual([
      "c.commands[1]",
      "c.commands[2]",
      "h.commands[2].thenDo",
      "c.commands[2].thenDo[1]",
      "e.commands[2].thenDo",
      "h.commands[2].elseDo",
      "c.commands[2].elseDo[1]",
      "h.commands[2].elseDo[1].branches[1]",
      "c.commands[2].elseDo[1].branches[1][1]",
      "e.commands[2].elseDo[1].branches[1]",
      "h.commands[2].elseDo[1].branches[2]",
      "e.commands[2].elseDo[1].branches[2]",
      "e.commands[2].elseDo",
      "c.commands[3]",
      "e.commands",
    ]);
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 1, 2, 2, 1, 2, 3, 4, 4, 3, 4, 2, 0, 0]);
    const heads = rows.filter((r) => r.kind === "header").map((r) => r.label);
    expect(heads).toEqual(["참이면", "아니면", "1. 묵는다", "2. 나간다"]);
  });

  it("접은 머리줄 아래는 숨고, 접힌 머리줄은 커맨드 수를 든다", () => {
    const rows = buildRows(NESTED, schema, new Set([headerKey([{ at: 1, list: "elseDo" }])]));
    expect(keys(rows)).toEqual(["c.commands[1]", "c.commands[2]", "h.commands[2].thenDo", "c.commands[2].thenDo[1]", "e.commands[2].thenDo", "h.commands[2].elseDo", "c.commands[3]", "e.commands"]);
    const head = rows.find((r) => r.key === "h.commands[2].elseDo");
    expect(head).toMatchObject({ kind: "header", folded: true, count: 1 });
  });

  it("없는 하위 목록도 머리줄과 끝 줄이 있어 그 안에 넣을 수 있다. 가지는 항목 수만큼", () => {
    const rows = buildRows([{ code: "if", cond: { flag: "a" } }, { code: "choice", options: ["a", "b", "c"] }], schema, new Set());
    expect(keys(rows)).toContain("e.commands[1].elseDo");
    const heads = rows.filter((r): r is HeaderRow => r.kind === "header" && r.key.startsWith("h.commands[2]"));
    expect(heads.map((r) => r.label)).toEqual(["1. a", "2. b", "3. c"]);
  });

  it("항목보다 많은 가지는 (항목 없음) 으로 보인다", () => {
    const rows = buildRows([{ code: "choice", options: ["a"], branches: [[], [{ code: "wait", ms: 1 }]] }], schema, new Set());
    expect(rows.filter((r) => r.kind === "header").map((r) => r.label)).toEqual(["1. a", "2. (항목 없음)"]);
  });

  it("배열이 아닌 하위 목록은 고칠 수 없는 머리줄 하나이고 끝 줄이 없다", () => {
    const rows = buildRows([{ code: "if", cond: { flag: "a" }, thenDo: "x" }, { code: "choice", options: ["a"], branches: 3 }], schema, new Set());
    const broken = rows.filter((r) => r.kind === "header" && r.broken);
    expect(broken.map((r) => r.key)).toEqual(["h.commands[1].thenDo", "h.commands[2].branches[1]"]);
    expect(keys(rows)).not.toContain("e.commands[1].thenDo");
  });

  it("모르는 커맨드, 객체가 아닌 칸, 끝의 null 도 줄이다 (뺄 수 있게)", () => {
    const rows = buildRows([{ code: "dance" }, 3, null], schema, new Set()) as CommandRow[];
    expect(rows.slice(0, 3).map((r) => [r.label, r.spec])).toEqual([
      ["알 수 없는 커맨드 dance", undefined],
      ["커맨드가 아니다", undefined],
      ["커맨드가 아니다", undefined],
    ]);
    expect(rows[2].summary).toBe("null");
  });

  it("commands 가 없으면 끝 줄 하나, 배열이 아니면 줄이 없다", () => {
    expect(keys(buildRows(undefined, schema, new Set()))).toEqual(["e.commands"]);
    expect(buildRows("x", schema, new Set())).toEqual([]);
  });

  it("엔진의 모든 픽스처 맵의 이벤트를 편다 (여관 주인의 깊은 중첩 포함)", () => {
    for (const name of ["port_town", "inn"]) {
      const { map } = fixtureMap(name);
      for (const ev of map.events ?? []) {
        const rows = buildRows(field(ev, "commands"), schema, new Set());
        expect(rows.at(-1)?.key).toBe("e.commands");
        for (const r of rows) if (r.kind === "command") expect(r.spec, r.key).toBeDefined();
      }
    }
  });
});

describe("요약", () => {
  it("summary 틀을 채우고, 없는 인자는 옆의 구분 글과 함께 뺀다", () => {
    expect(commandSummary(schema, { code: "message", name: "선장", text: "안녕" })).toBe("선장: 안녕");
    expect(commandSummary(schema, { code: "message", text: "안녕" })).toBe("안녕");
    expect(fillSummary("{name}: {text}", (n) => (n === "name" ? "이름" : ""))).toBe("이름");
    expect(fillSummary("{a} - {b} - {c}", (n) => (n === "b" ? "" : n))).toBe("a - c");
    // 앞의 둘이 다 없으면 둘 다 뒤의 구분 글과 함께 빠진다
    expect(fillSummary("{a} - {b} - {c}", (n) => (n === "c" ? "c" : ""))).toBe("c");
    expect(fillSummary("{a} - {b} - {c}", () => "")).toBe("");
  });

  it("여러 줄 대사는 첫 줄과 … 이고, 긴 글은 자른다", () => {
    expect(commandSummary(schema, { code: "message", text: "첫 줄\n둘째 줄" })).toBe("첫 줄 …");
    const long = commandSummary(schema, { code: "message", text: "가".repeat(200) });
    expect(long.length).toBe(80);
    expect(long.endsWith("…")).toBe(true);
  });

  it("summary 가 없으면 첫 필수 인자: 항목, 조건, 맵, 걸음", () => {
    expect(commandSummary(schema, { code: "choice", options: ["떠난다", "더 둘러본다"] })).toBe("떠난다 / 더 둘러본다");
    expect(commandSummary(schema, { code: "if", cond: { item: "shell", op: ">=", value: 2 } })).toBe("아이템 shell >= 2");
    expect(commandSummary(schema, { code: "transfer", map: "inn", x: 9, y: 11 })).toBe("inn");
    expect(commandSummary(schema, { code: "moveRoute", target: "player", route: ["up", "wait:300"] })).toBe("player");
    expect(commandSummary(schema, { code: "playSe", file: "./resources/audio/door.wav" })).toBe("door.wav");
    expect(commandSummary(schema, { code: "comment" })).toBe("");
  });

  it("2^53을 넘는 정수(표식 글)는 숫자 그대로 보인다", () => {
    const big = bigIntValue("12345678901234567890");
    expect(commandSummary(schema, { code: "wait", ms: big })).toContain("12345678901234567890");
    expect(commandSummary(schema, { code: "wait", ms: big })).not.toContain("INT:");
    expect(commandSummary(schema, { code: "unknownThing", data: { seed: big } })).toBe('{"code":"unknownThing","data":{"seed":12345678901234567890}}');
    expect(branchLabel("{n}. {option}", 1, big)).toBe("1. 12345678901234567890");
  });

  it("조건 한 줄: 깃발의 값은 = 로, 빈 조건은 늘 참", () => {
    expect(conditionSummary(schema, { flag: "arrived" })).toBe("깃발 arrived");
    expect(conditionSummary(schema, { flag: "arrived", equals: false })).toBe("깃발 arrived = false");
    expect(conditionSummary(schema, { var: "coins", op: "<", value: 3 })).toBe("변수 coins < 3");
    expect(conditionSummary(schema, {})).toBe("빈 조건 (늘 참)");
  });

  it("가지 머리줄 이름", () => {
    expect(branchLabel("{n}. {option}", 2, "나간다")).toBe("2. 나간다");
    expect(branchLabel("{n}. {option}", 3, undefined)).toBe("3. (항목 없음)");
  });
});

describe("문제 붙이기", () => {
  const events = [
    {
      id: "a",
      x: 0,
      y: 0,
      commands: [
        { code: "message" },
        { code: "if", cond: { flag: "items" }, thenDo: [{ code: "wait", ms: -1 }] },
      ],
    },
  ];
  const problems = validateEvents(events, { schema }).filter((p) => isCommandProblem(p, 0));

  it("커맨드 목록 안의 문제만 고른다 (엔진 표기)", () => {
    expect(problems.map((p) => p.location)).toEqual(["events[1].commands[1].text", "events[1].commands[2].cond.flag", "events[1].commands[2].thenDo[1].ms"]);
    expect(isCommandProblem({ location: "events[1].x" } as EventProblem, 0)).toBe(false);
    expect(isCommandProblem({ location: "events[2].commands[1]" } as EventProblem, 0)).toBe(false);
  });

  it("문제를 그 커맨드 줄에, 접혀 숨었으면 숨긴 머리줄에 붙인다", () => {
    const open = problemsByRow(problems, buildRows(events[0].commands, schema, new Set()), schema);
    expect([...open.keys()]).toEqual(["c.commands[1]", "c.commands[2]", "c.commands[2].thenDo[1]"]);
    const folded = problemsByRow(problems, buildRows(events[0].commands, schema, new Set(["h.commands[2].thenDo"])), schema);
    expect(folded.get("h.commands[2].thenDo")?.map((p) => p.location)).toEqual(["events[1].commands[2].thenDo[1].ms"]);
  });

  it("조상 키와 펼칠 머리줄", () => {
    const path = { list: [{ at: 1, list: "elseDo" }, { at: 0, list: "branches", branch: 1 }], index: 2 };
    expect(ancestorKeys(path)).toEqual([
      "c.commands[2].elseDo[1].branches[2][3]",
      "h.commands[2].elseDo[1].branches[2]",
      "c.commands[2].elseDo[1]",
      "h.commands[2].elseDo",
      "c.commands[2]",
    ]);
    expect(headersAbove(path)).toEqual(["h.commands[2].elseDo", "h.commands[2].elseDo[1].branches[2]"]);
  });

  it("가장 무거운 등급", () => {
    expect(worstSeverity([{ severity: "info" }, { severity: "error" }, { severity: "warning" }] as EventProblem[])).toBe("error");
    expect(worstSeverity([])).toBeNull();
  });
});

describe("고르기와 넣을 자리", () => {
  const rows = buildRows(NESTED, schema, new Set());
  const row = (key: string) => rows.find((r) => r.key === key);

  it("같은 목록의 커서와 닻 사이가 고른 범위다. 다른 목록의 닻은 무시한다", () => {
    expect(selectedRange(row("c.commands[3]"), row("c.commands[1]"))).toEqual({ list: [], start: 0, count: 3 });
    expect(selectedRange(row("c.commands[3]"), row("c.commands[2].thenDo[1]"))).toEqual({ list: [], start: 2, count: 1 });
    expect(selectedRange(row("e.commands"), undefined)).toBeNull();
  });

  it("위에 넣기, 아래에 넣기, 끝 줄, 머리줄", () => {
    const r = selectedRange(row("c.commands[2]"), row("c.commands[3]"));
    expect(insertTarget(row("c.commands[2]"), r, "above")).toEqual({ list: [], index: 1 });
    expect(insertTarget(row("c.commands[2]"), r, "below")).toEqual({ list: [], index: 3 });
    expect(insertTarget(row("e.commands[2].elseDo[1].branches[2]"), null, "above")).toEqual({ list: [{ at: 1, list: "elseDo" }, { at: 0, list: "branches", branch: 1 }], index: 0 });
    expect(insertTarget(row("h.commands[2].thenDo"), null, "below")).toEqual({ list: [{ at: 1, list: "thenDo" }], index: 0 });
    expect(insertTarget(undefined, null, "above")).toEqual({ list: [], index: 0 });
    expect(commandKey({ list: [], index: 0 })).toBe("c.commands[1]");
    expect(endKey([])).toBe("e.commands");
  });
});
