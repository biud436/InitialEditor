// ref 칸의 제안 (refs.ts): 이 맵의 이벤트 id 는 글인 것만 캐릭터로 제안한다.
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { fixtureSchema } from "../testing/fixtures";
import { refSuggestions } from "./refs";

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
