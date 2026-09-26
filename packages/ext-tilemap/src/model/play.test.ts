// 스키마의 play 칸: env와 maps(여기서 실행을 켤 맵 이름의 글롭) 읽기, 글롭 맞추기.
import { describe, expect, it } from "vitest";
import { matchesMapGlob, parseObjectSchema, playAllowsMap, SchemaError } from "./schema";

const withPlay = (play: unknown) => JSON.stringify({ version: 1, types: [], play });

describe("play.maps", () => {
  it("글롭: * 는 아무 글자열(빈 것도), ? 는 한 글자, 나머지는 그대로이고 전체가 맞아야 한다", () => {
    expect(matchesMapGlob("aldebaran_*", "aldebaran_forest")).toBe(true);
    expect(matchesMapGlob("aldebaran_*", "aldebaran_")).toBe(true);
    expect(matchesMapGlob("aldebaran_*", "vm_a")).toBe(false);
    expect(matchesMapGlob("aldebaran_*", "my_aldebaran_forest")).toBe(false);
    expect(matchesMapGlob("*_forest", "aldebaran_forest")).toBe(true);
    expect(matchesMapGlob("stage?", "stage1")).toBe(true);
    expect(matchesMapGlob("stage?", "stage")).toBe(false);
    expect(matchesMapGlob("stage?", "stage12")).toBe(false);
    expect(matchesMapGlob("forest", "forest")).toBe(true);
    expect(matchesMapGlob("forest", "forest2")).toBe(false);
    expect(matchesMapGlob("*", "항구 마을")).toBe(true);
    expect(matchesMapGlob("항구 *", "항구 마을")).toBe(true);
  });

  it("글롭: 정규식 글자는 글자 그대로이고 대소문자를 가린다", () => {
    expect(matchesMapGlob("a.b", "a.b")).toBe(true);
    expect(matchesMapGlob("a.b", "axb")).toBe(false);
    expect(matchesMapGlob("(x)+[y]", "(x)+[y]")).toBe(true);
    expect(matchesMapGlob("^$|\\{}", "^$|\\{}")).toBe(true);
    expect(matchesMapGlob("Aldebaran_*", "aldebaran_forest")).toBe(false);
  });

  it("스키마에서 읽는다. 없으면 모든 맵, 있으면 맞는 맵만, play가 없으면 어느 맵도 아니다", () => {
    const open = parseObjectSchema(withPlay({ env: { STAGE: "{map.name}" } }));
    expect(open.play).toEqual({ env: { STAGE: "{map.name}" } });
    expect(playAllowsMap(open.play, "vm_a")).toBe(true);

    const listed = parseObjectSchema(withPlay({ env: { STAGE: "{map.name}" }, maps: ["aldebaran_*", "boss"] }));
    expect(listed.play).toEqual({ env: { STAGE: "{map.name}" }, maps: ["aldebaran_*", "boss"] });
    expect(playAllowsMap(listed.play, "aldebaran_forest")).toBe(true);
    expect(playAllowsMap(listed.play, "aldebaran_tomb")).toBe(true);
    expect(playAllowsMap(listed.play, "boss")).toBe(true);
    expect(playAllowsMap(listed.play, "vm_a")).toBe(false);
    expect(playAllowsMap(listed.play, "항구 마을")).toBe(false);

    const empty = parseObjectSchema(withPlay({ env: {}, maps: [] }));
    expect(playAllowsMap(empty.play, "aldebaran_forest")).toBe(false);
    expect(playAllowsMap(null, "aldebaran_forest")).toBe(false);
  });

  it("maps가 비지 않은 글의 배열이 아니면 스키마 오류다", () => {
    for (const maps of ["aldebaran_*", [1], [""], ["  "], { a: 1 }, null]) {
      expect(() => parseObjectSchema(withPlay({ env: {}, maps }))).toThrow(SchemaError);
      expect(() => parseObjectSchema(withPlay({ env: {}, maps }))).toThrow(/play\.maps/);
    }
  });

  it("env가 없으면 play가 없고 maps는 보지 않는다", () => {
    expect(parseObjectSchema(withPlay({ maps: ["x"] })).play).toBeNull();
    expect(parseObjectSchema(withPlay({ maps: 3 })).play).toBeNull();
  });
});
