import { describe, expect, it } from "vitest";
import { fixtureSchema, fixtureText } from "../testing/fixtures";
import {
  assetCandidates,
  commandSpec,
  EventSchemaError,
  EventSchemaVersionError,
  fieldSpec,
  judgedCondition,
  parseEventSchema,
  schemaLockReason,
  sheetCount,
} from "./schema";

const RAW = JSON.parse(fixtureText("resources/schema/event-commands.json")) as Record<string, unknown>;

function withPatch(patch: (s: Record<string, unknown>) => void): string {
  const s = JSON.parse(JSON.stringify(RAW)) as Record<string, unknown>;
  patch(s);
  return JSON.stringify(s);
}

function errorOf(text: string): EventSchemaError {
  try {
    parseEventSchema(text);
  } catch (e) {
    if (e instanceof EventSchemaError) return e;
    throw e;
  }
  throw new Error("오류가 나야 한다");
}

describe("event-commands.json 읽기", () => {
  it("엔진의 스키마: 커맨드 17종, 조건 셋, 이벤트 칸 11개", () => {
    const s = fixtureSchema();
    expect(s.version).toBe(1);
    expect(s.commands.map((c) => c.code)).toEqual([
      "message",
      "choice",
      "wait",
      "transfer",
      "moveRoute",
      "turn",
      "setFlag",
      "setVar",
      "giveItem",
      "takeItem",
      "if",
      "playSe",
      "playBgm",
      "showLocation",
      "scene",
      "script",
      "comment",
    ]);
    expect(s.conditions.map((c) => c.kind)).toEqual(["item", "flag", "var"]);
    expect(s.fields.map((f) => f.name)).toEqual(["id", "x", "y", "dir", "trigger", "charset", "through", "solid", "speed", "wander", "commands"]);
    expect(s.reserved).toEqual(["player"]);
    expect(s.stateReserved).toEqual(["items"]);
    expect(s.route).toEqual({ moves: ["up", "down", "left", "right"], turnPrefix: "turn:", waitPrefix: "wait:" });
  });

  it("인자 명세: 타입, 필수, 범위, values, ref, 하위 목록", () => {
    const s = fixtureSchema();
    const choice = commandSpec(s, "choice")!;
    expect(choice.args.map((a) => [a.name, a.type, a.required, a.min])).toEqual([
      ["options", "options", true, 1],
      ["cancel", "integer", false, 1],
    ]);
    expect(choice.lists).toEqual([{ name: "branches", label: "{n}. {option}", perOption: "options" }]);
    expect(commandSpec(s, "if")!.lists.map((l) => l.name)).toEqual(["thenDo", "elseDo"]);
    expect(commandSpec(s, "transfer")!.ends).toBe(true);
    expect(commandSpec(s, "message")!.summary).toBe("{name}: {text}");
    expect(commandSpec(s, "transfer")!.args[0]).toMatchObject({ name: "map", type: "ref", ref: "map", required: true });
    expect(commandSpec(s, "playBgm")!.args.find((a) => a.name === "volume")).toMatchObject({ min: 0, max: 128 });
    expect(commandSpec(s, "playSe")!.args[0]).toMatchObject({ accept: ["wav", "ogg"], dir: "resources/audio" });
    expect(commandSpec(s, "scene")!.args[0].suggest).toEqual(["title"]);
    expect(commandSpec(s, "moveRoute")!.args.find((a) => a.name === "wait")!.default).toBe(true);
    expect(commandSpec(s, "nothing")).toBeUndefined();
    expect(commandSpec(s, 5)).toBeUndefined();
    expect(fieldSpec(s, "trigger")!.values).toEqual(["action", "touch", "auto", "parallel"]);
  });

  it("자산과 시트", () => {
    const s = fixtureSchema();
    expect(assetCandidates(s, "charset", "npc")).toEqual(["./resources/rtp/CharSet/People1.png", "./resources/charsets/placeholder.png"]);
    expect(assetCandidates(s, "face", "player")).toBeUndefined();
    expect(s.sheets.charset).toMatchObject({ frameW: 24, frameH: 32, sheetCols: 4, perSheet: 8, patterns: 3, standPattern: 1 });
    expect(s.sheets.charset.dirRows).toEqual({ up: 0, right: 1, down: 2, left: 3 });
    expect(sheetCount(s, "charset")).toBe(8);
    expect(sheetCount(s, "face")).toBe(16);
  });

  it("판정하는 꼴은 conditions 순서로 먼저 있는 키다 (null 은 없는 키)", () => {
    const s = fixtureSchema();
    expect(judgedCondition(s, { flag: "a", item: "b" })!.kind).toBe("item");
    expect(judgedCondition(s, { item: null, var: "v" })!.kind).toBe("var");
    expect(judgedCondition(s, {})).toBeUndefined();
    expect(judgedCondition(s, [1])).toBeUndefined();
  });

  it("모르는 버전은 EventSchemaVersionError 이고 잠금 문구가 된다", () => {
    const e = errorOf(withPatch((s) => (s.version = 2)));
    expect(e).toBeInstanceOf(EventSchemaVersionError);
    expect(e.location).toBe("version");
    expect(schemaLockReason(e)).toContain("지원하지 않는 event-commands.json 버전: 2 (이 에디터는 버전 1 만 편집 가능)");
    expect(errorOf(withPatch((s) => delete s.version))).toBeInstanceOf(EventSchemaVersionError);
    expect(schemaLockReason(new Error("x"))).toBeNull();
    expect(schemaLockReason(errorOf("[]"))).toBeNull();
  });

  it("틀린 곳은 위치와 함께 알린다", () => {
    const commands = (s: Record<string, unknown>) => s.commands as Array<Record<string, unknown>>;
    const args = (s: Record<string, unknown>, i: number) => commands(s)[i].args as Array<Record<string, unknown>>;
    expect(errorOf("{").message).toContain("JSON 구문 오류: ");
    expect(errorOf("[]").message).toContain("객체여야");
    expect(errorOf(withPatch((s) => (args(s, 0)[0].type = "number2"))).location).toBe("commands[0].args[0].type");
    expect(errorOf(withPatch((s) => delete args(s, 3)[0].ref)).location).toBe("commands[3].args[0].ref");
    expect(errorOf(withPatch((s) => delete args(s, 3)[3].values)).location).toBe("commands[3].args[3].values");
    expect(errorOf(withPatch((s) => ((commands(s)[1].lists as Array<Record<string, unknown>>)[0].perOption = "cancel"))).location).toBe("commands[1].lists[0].perOption");
    expect(errorOf(withPatch((s) => (commands(s)[2].code = "message"))).message).toContain("code message 중복");
    expect(errorOf(withPatch((s) => args(s, 0).push({ name: "text", type: "string" }))).message).toContain("commands[0].args: 인자 text 중복");
    expect(errorOf(withPatch((s) => args(s, 0).push({ name: "code", type: "string" }))).location).toBe("commands[0].args");
    expect(errorOf(withPatch((s) => args(s, 0).push({ name: "look", type: "charset" }))).message).toContain("이벤트 필드 전용");
    expect(errorOf(withPatch((s) => (args(s, 0)[0].min = "a"))).location).toBe("commands[0].args[0].min");
    expect(errorOf(withPatch((s) => ((s.conditions as Array<Record<string, unknown>>)[1].args = []))).location).toBe("conditions[1].args");
    expect(errorOf(withPatch((s) => (((s.sheets as Record<string, Record<string, unknown>>).charset.standPattern = 3)))).location).toBe("sheets.charset.standPattern");
    expect(errorOf(withPatch((s) => (((s.assets as Record<string, Record<string, unknown>>).face.npc = [])))).location).toBe("assets.face.npc");
    expect(errorOf(withPatch((s) => ((s.event as Record<string, unknown>).fields = [{ name: "id", type: "string" }]))).message).toContain("x 필드 없음");
    expect(errorOf(withPatch((s) => delete s.route)).location).toBe("route");
  });

  it("모르는 키는 무시한다 (엔진 테스트 [A] 가 닫는다)", () => {
    const s = parseEventSchema(withPatch((raw) => ((raw as Record<string, unknown>).extra = { a: 1 })));
    expect(s.commands).toHaveLength(17);
  });
});
