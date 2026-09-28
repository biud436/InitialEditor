// ref 칸의 제안 (refs.ts): 이 맵의 이벤트 id 는 글인 것만 캐릭터로 제안한다. 깃발과 변수, 시작 상태 칸의 제안은
// 글인 키만 모은다 (2^53을 넘는 정수 키의 표식 글이 제안에 나오지 않는다).
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { fixtureSchema } from "../testing/fixtures";
import { refSuggestions, startStateSuggestions, usedStateNames } from "./refs";

const schema = fixtureSchema();

describe("refSuggestions", () => {
  it("캐릭터: 글인 이벤트 id(겹치면 하나)와 예약된 player. 2^53을 넘는 정수 id(표식 글)와 수와 빈 글은 빠진다", () => {
    const events = [
      { id: "kid", x: 0, y: 0, charset: { set: "npc", index: 0 } },
      { id: "sign", x: 1, y: 0 },
      { id: bigIntValue("12345678901234567890"), x: 2, y: 0 },
      { id: 7, x: 3, y: 0 },
      { id: "", x: 4, y: 0 },
      { id: "kid", x: 5, y: 0 },
    ];
    const out = refSuggestions("character", { schema, events });
    expect(out).toEqual([{ value: "kid" }, { value: "sign", detail: "외형 없음" }, ...schema.reserved.map((r) => ({ value: r, detail: "플레이어" }))]);
    expect(JSON.stringify(out)).not.toContain("INT:");
  });
});

describe("깃발과 변수의 제안", () => {
  const big = bigIntValue("12345678901234567890");
  const events = [
    {
      id: "a",
      x: 0,
      y: 0,
      commands: [
        { code: "setFlag", key: big, value: true },
        { code: "setVar", key: bigIntValue("98765432109876543210"), value: 1 },
        { code: "setFlag", key: "met" },
        { code: "setVar", key: "coins", value: 2 },
        { code: "if", cond: { flag: big }, thenDo: [{ code: "setFlag", key: 7 }] },
        { code: "if", cond: { var: bigIntValue("11111111111111111111"), op: ">", value: 0 } },
      ],
    },
  ];

  it("2^53을 넘는 정수 키(표식 글)와 수는 깃발과 변수 이름이 아니다", () => {
    expect(usedStateNames(schema, [events])).toEqual({ flags: ["met"], vars: ["coins"] });
    expect(refSuggestions("flag", { schema, events }).map((s) => s.value)).toEqual(["met"]);
    expect(refSuggestions("var", { schema, events }).map((s) => s.value)).toEqual(["coins"]);
  });

  it("시작 상태 칸의 제안에도 표식 글이 나오지 않는다", () => {
    const out = startStateSuggestions({ schema, events });
    expect(out.map((s) => s.value)).toEqual(["met", "coins="]);
    expect(JSON.stringify(out)).not.toContain("INT:");
  });
});
